"""Optional link to the VoiceGuard API (synthetic-voice / deepfake risk).

VoiceGuard is a separate service. CallSense only calls its REST API and never stores the audio.
Set VOICEGUARD_URL (and VOICEGUARD_KEY) to enable it.
"""
import os

import requests

URL = os.getenv("VOICEGUARD_URL", "")
KEY = os.getenv("VOICEGUARD_KEY", "")


def check(data: bytes, filename: str = "clip"):
    if not URL:
        return {"available": False, "reason": "VoiceGuard is not configured"}
    try:
        r = requests.post(URL.rstrip("/") + "/v1/analyze", headers={"X-API-Key": KEY} if KEY else {},
                          files={"file": (filename, data)}, timeout=90)
        r.raise_for_status()
        j = r.json()
        return {"available": True, "zone": j["zone"], "risk": j["risk"],
                "note": "GREEN means no synthetic-voice signal was found; it does not prove the caller is genuine."}
    except Exception as e:
        return {"available": False, "reason": f"VoiceGuard unreachable ({type(e).__name__})"}
