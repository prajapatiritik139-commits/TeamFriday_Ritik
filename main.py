"""CallSense API - real-time speech-emotion signals for cybercrime call triage.

Emotion output is an INDICATIVE signal, never evidence of intent, honesty or guilt.

REST:   GET    /health
        POST   /v1/analyze            (audio file -> per-window emotions, urgency, priority; optional voice-clone check)
        GET    /v1/queue              (all active calls, highest priority first)
        GET    /v1/call/{id}          (rolling state, scores only)
        DELETE /v1/call/{id}          (forget a call)
        GET    /v1/admin/stats
WS:     /v1/stream/{call_id}          (PCM16 16 kHz mono binary chunks in, rolling emotion scores out)
"""
import collections
import hmac
import json
import os
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import (Depends, FastAPI, File, Form, Header, HTTPException, UploadFile,
                     WebSocket, WebSocketDisconnect)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import voiceguard
from .audio import SR, decode_bytes
from .emotion import CLASSES, EmotionModel, LABELS, level_of, urgency_from_probs
from .policy import CallStore
from .privacy import AuditLog, hid

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_KEY = os.getenv("API_KEY", "")                        # empty = auth disabled (dev only)
MODEL_NPZ = os.getenv("MODEL_NPZ", os.path.join(BASE, "model", "emotion_head.npz"))
DEVICE = os.getenv("DEVICE", "cpu")
FAKE_EMBEDDER = os.getenv("FAKE_EMBEDDER") == "1"           # tests only
LOG_PATH = os.getenv("LOG_PATH", "/tmp/callsense/audit.jsonl")
CORS = os.getenv("CORS_ORIGINS", "*").split(",")
WIN_SEC, FIRST_SEC, HOP_SEC = 6, 3, 2
MAX_FILE_MB = 25
MAX_FILE_WINDOWS = 20

S = {}
STATS = {"windows": 0, "levels": collections.Counter(), "latency_ms_sum": 0, "started": time.time()}
store = CallStore()


@asynccontextmanager
async def lifespan(app):
    S["em"] = EmotionModel(MODEL_NPZ, device=DEVICE, fake_embedder=FAKE_EMBEDDER)
    S["log"] = AuditLog(LOG_PATH)
    yield


app = FastAPI(title="CallSense API", version="1.0", lifespan=lifespan,
              description="Indicative speech-emotion signals for call triage. Audio is never stored.")
app.add_middleware(CORSMiddleware, allow_origins=CORS, allow_methods=["*"], allow_headers=["*"])


def auth(x_api_key: str = Header(default="")):
    if API_KEY and not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="invalid or missing X-API-Key")


def _count(r):
    STATS["windows"] += 1
    STATS["levels"][r["level"]] += 1
    STATS["latency_ms_sum"] += r["latency_ms"]


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(os.path.join(BASE, "static", "index.html"))


@app.get("/health")
def health():
    return {"status": "ok", "model": "callsense-emotion-v1 (XLS-R 300M + logistic head, 5 classes)",
            "device": S["em"].device, "classes": {c: LABELS.get(c, c) for c in S["em"].classes},
            "voiceguard_linked": bool(voiceguard.URL), "audio_stored": False,
            "disclaimer": "Indicative signal only; not evidence of intent, honesty or guilt."}


# ------------------------------------------------------------------ analyze a recorded call
@app.post("/v1/analyze", dependencies=[Depends(auth)])
async def analyze(file: UploadFile = File(...), call_id: str | None = Form(default=None),
                  label: str = Form(default=""), voice_check: bool = Form(default=True)):
    data = await file.read()
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"file too large (max {MAX_FILE_MB} MB)")
    try:
        wave = await run_in_threadpool(decode_bytes, data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if len(wave) < SR:
        raise HTTPException(422, "audio too short (need at least 1 second)")

    em = S["em"]
    cid = call_id or "call-" + os.urandom(4).hex()
    sess = store.get(cid, label)
    win = SR * WIN_SEC
    starts = list(range(0, max(1, len(wave) - win + 1), SR * 3))[:MAX_FILE_WINDOWS]
    windows = []
    for st in starts:
        r = await run_in_threadpool(em.analyze, wave[st: st + win])
        r["start_s"] = round(st / SR, 1)
        windows.append(r)
        _count(r)
        sess.add(r["probs"], r["urgency"], r["level"])
    state = sess.state()
    voice = (await run_in_threadpool(voiceguard.check, data, file.filename or "clip")
             if voice_check else {"available": False, "reason": "not requested"})
    latency = sum(r["latency_ms"] for r in windows)
    S["log"].write("analyze", call=hid(cid), level=state["level"], urgency=state["urgency"],
                   top=state["top"], windows=len(windows), latency_ms=latency,
                   voice_zone=voice.get("zone"))
    return {"call_id": cid, "label": sess.label, "duration_s": round(len(wave) / SR, 1), "windows": windows,
            "latency_ms": latency, "session": state, "voice": voice,
            "disclaimer": "Indicative signal only; not evidence of intent, honesty or guilt."}


# ------------------------------------------------------------------ live stream
@app.websocket("/v1/stream/{call_id}")
async def stream(ws: WebSocket, call_id: str, api_key: str = "", label: str = ""):
    if API_KEY and not hmac.compare_digest(api_key, API_KEY):
        await ws.close(code=4401)
        return
    await ws.accept()
    em, sess = S["em"], store.get(call_id, label)
    buf = np.zeros(0, dtype=np.float32)
    since = 0
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes"):
                pcm = np.frombuffer(msg["bytes"], dtype="<i2").astype(np.float32) / 32768.0
                buf = np.concatenate([buf, pcm])[-WIN_SEC * SR:]       # only the last 6 s are held in memory
                since += len(pcm)
            elif msg.get("text"):
                try:
                    if json.loads(msg["text"]).get("type") == "end":
                        break
                except ValueError:
                    pass
            if len(buf) >= FIRST_SEC * SR and since >= HOP_SEC * SR:
                since = 0
                r = await run_in_threadpool(em.analyze, buf.copy())
                _count(r)
                sess.add(r["probs"], r["urgency"], r["level"])
                st = sess.state()
                S["log"].write("stream_window", call=hid(call_id), level=st["level"], urgency=st["urgency"],
                               top=st["top"], latency_ms=r["latency_ms"])
                await ws.send_json({"type": "score", **r, "session": st})
    except WebSocketDisconnect:
        pass
    finally:
        buf = None
        try:
            await ws.send_json({"type": "end", "session": sess.state()})
            await ws.close()
        except Exception:
            pass


# ------------------------------------------------------------------ queue + admin
@app.get("/v1/queue", dependencies=[Depends(auth)])
def queue():
    return {"calls": store.queue()}


@app.get("/v1/call/{call_id}", dependencies=[Depends(auth)])
def call_state(call_id: str):
    sess = store.peek(call_id)
    if not sess:
        raise HTTPException(404, "unknown or expired call")
    return {**sess.state(), "label": sess.label,
            "history": [{"urgency": w["urgency"], "level": w["level"]} for w in sess.windows]}


@app.delete("/v1/call/{call_id}", dependencies=[Depends(auth)])
def forget(call_id: str):
    return {"forgotten": store.forget(call_id)}


@app.get("/v1/admin/stats", dependencies=[Depends(auth)])
def admin_stats():
    n = max(STATS["windows"], 1)
    return {"uptime_s": int(time.time() - STATS["started"]), "active_calls": store.active(),
            "windows_scored": STATS["windows"], "level_counts": dict(STATS["levels"]),
            "avg_latency_ms": round(STATS["latency_ms_sum"] / n, 1),
            "privacy": {"raw_audio_stored": False, "transcripts_stored": False, "embeddings_stored": False}}
