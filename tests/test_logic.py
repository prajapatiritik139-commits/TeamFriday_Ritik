"""Plain-python logic tests (no web server needed):  python tests/test_logic.py"""
import math
import os
import sys
import tempfile
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.audio import decode_bytes                                   # noqa: E402
from app.emotion import CLASSES, EmotionModel, level_of, softmax, urgency_from_probs   # noqa: E402
from app.policy import CallSession, CallStore                        # noqa: E402


def test_urgency_and_levels():
    p = dict(ANG=0.1, FEA=0.1, SAD=0.1, NEU=0.6, HAP=0.1)
    assert abs(urgency_from_probs(p) - 30) < 1e-9 and level_of(30) == "LOW"
    p = dict(ANG=0.3, FEA=0.3, SAD=0.2, NEU=0.1, HAP=0.1)
    assert abs(urgency_from_probs(p) - 80) < 1e-9 and level_of(80) == "HIGH"
    assert level_of(40) == "MEDIUM" and level_of(39.9) == "LOW" and level_of(70) == "HIGH"
    s = softmax([1, 2, 3, 4, 5])
    assert abs(s.sum() - 1) < 1e-9 and s.argmax() == 4


def _sess(levels):
    s = CallSession("t", "case")
    for lv in levels:
        u = {"LOW": 20.0, "MEDIUM": 55.0, "HIGH": 85.0}[lv]
        p = dict(ANG=0.1, FEA=0.1, SAD=0.1, NEU=0.5, HAP=0.2) if lv == "LOW" else dict(ANG=0.3, FEA=0.3, SAD=0.2, NEU=0.1, HAP=0.1)
        s.add(p, u, lv)
    return s.state()


def test_hysteresis():
    assert _sess([])["level"] == "UNKNOWN"
    assert _sess(["LOW", "LOW", "LOW"])["level"] == "LOW"
    assert _sess(["HIGH"])["level"] == "MEDIUM", "a single HIGH window is only provisional"
    assert _sess(["LOW", "HIGH", "LOW"])["level"] == "MEDIUM"
    assert _sess(["LOW", "HIGH", "HIGH"])["level"] == "HIGH"
    assert _sess(["MEDIUM", "MEDIUM", "LOW"])["level"] == "MEDIUM"
    st = _sess(["HIGH", "HIGH", "HIGH"])
    assert st["peak_urgency"] == 85.0 and st["top"] in CLASSES


def test_queue_order_and_forget():
    st = CallStore()
    for cid, lv in (("a", ["LOW"] * 3), ("b", ["HIGH"] * 3), ("c", ["MEDIUM"] * 3)):
        s = st.get(cid, "call " + cid)
        for l in lv:
            s.add(dict(ANG=0.3, FEA=0.3, SAD=0.2, NEU=0.1, HAP=0.1), {"LOW": 20.0, "MEDIUM": 55.0, "HIGH": 85.0}[l], l)
    order = [r["call_id"] for r in st.queue()]
    assert order == ["b", "c", "a"], order
    assert st.forget("b") and not st.forget("b")
    assert [r["call_id"] for r in st.queue()] == ["c", "a"]


def _npz(path):
    rng = np.random.RandomState(0)
    np.savez(path, mean=rng.randn(6144), scale=np.abs(rng.randn(6144)) + 0.5, coef=rng.randn(5, 6144) * 0.01,
             intercept=np.zeros(5), classes=np.array(CLASSES))


def test_model_and_audio():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "m.npz")
    _npz(p)
    em = EmotionModel(p, fake_embedder=True)
    t = np.arange(16000 * 4) / 16000
    pcm = (np.sin(2 * math.pi * 220 * t) * 12000).astype("<i2")
    wp = os.path.join(d, "a.wav")
    with wave.open(wp, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(pcm.tobytes())
    wf = decode_bytes(open(wp, "rb").read())
    assert abs(len(wf) - 64000) < 800 and wf.dtype == np.float32
    r = em.analyze(wf)
    assert set(r) >= {"probs", "top", "urgency", "level", "latency_ms"}
    assert abs(sum(r["probs"].values()) - 1) < 0.01 and r["level"] in ("LOW", "MEDIUM", "HIGH")
    try:
        decode_bytes(b"this is not audio")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
    print("ALL PASS")
