"""Call sessions, smoothing and the priority queue.

Emotion output is an INDICATIVE signal. A single window can never make a call HIGH priority on its own:
HIGH needs >= 2 of the last 3 windows to be HIGH (same hysteresis idea as the voice-clone detector).
"""
import threading
import time
from collections import deque

from .emotion import CLASSES, LABELS, level_of

SESSION_TTL = 30 * 60
RANK = {"HIGH": 2, "MEDIUM": 1, "LOW": 0, "UNKNOWN": -1}


class CallSession:
    def __init__(self, cid, label=""):
        self.id = cid
        self.label = (label or "")[:60]
        self.t0 = time.time()
        self.last = self.t0
        self.windows = deque(maxlen=30)

    def add(self, probs, urgency, level):
        self.windows.append({"probs": probs, "urgency": urgency, "level": level})
        self.last = time.time()

    def state(self):
        w = list(self.windows)
        if not w:
            return {"level": "UNKNOWN", "urgency": None, "windows": 0, "top": None, "top_label": None,
                    "peak_urgency": None, "reasons": ["no audio analysed yet"]}
        recent = w[-3:]
        highs = sum(x["level"] == "HIGH" for x in recent)
        nonlow = sum(x["level"] != "LOW" for x in recent)
        urg = sum(x["urgency"] for x in recent) / len(recent)
        if highs >= 2:
            level = "HIGH"
            reasons = [f"{highs} of the last {len(recent)} windows show a strong distress / fear / anger signal"]
        elif highs >= 1 or nonlow >= 2:
            level = "MEDIUM"
            reasons = ["some distress / fear / anger signal, not yet sustained"]
        else:
            level = "LOW"
            reasons = ["no sustained distress, fear or anger signal in recent windows"]
        mean = {c: sum(x["probs"].get(c, 0.0) for x in recent) / len(recent) for c in CLASSES}
        top = max(mean, key=mean.get)
        return {"level": level, "urgency": round(urg, 1), "windows": len(w), "top": top,
                "top_label": LABELS.get(top, top), "peak_urgency": round(max(x["urgency"] for x in w), 1),
                "reasons": reasons}


class CallStore:
    def __init__(self):
        self._d = {}
        self._lock = threading.Lock()

    def get(self, cid, label=""):
        with self._lock:
            self._gc()
            if cid not in self._d:
                self._d[cid] = CallSession(cid, label)
            elif label and not self._d[cid].label:
                self._d[cid].label = label[:60]
            return self._d[cid]

    def peek(self, cid):
        with self._lock:
            return self._d.get(cid)

    def forget(self, cid):
        with self._lock:
            return self._d.pop(cid, None) is not None

    def active(self):
        with self._lock:
            self._gc()
            return len(self._d)

    def queue(self):
        with self._lock:
            self._gc()
            sessions = list(self._d.values())
        now = time.time()
        rows = []
        for s in sessions:
            st = s.state()
            rows.append({"call_id": s.id, "label": s.label or s.id[:8], "level": st["level"],
                         "urgency": st["urgency"], "top_label": st["top_label"], "windows": st["windows"],
                         "age_s": int(now - s.last)})
        rows.sort(key=lambda r: (RANK[r["level"]], r["urgency"] or 0), reverse=True)
        return rows

    def _gc(self):
        now = time.time()
        for k in [k for k, s in self._d.items() if now - s.last > SESSION_TTL]:
            del self._d[k]
