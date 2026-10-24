"""Privacy-preserving audit log.

Stored: timestamp, hashed session id, score, zone, risk, latency, decision.
NEVER stored: raw audio, transcripts, embeddings, phone numbers or account numbers.
"""
import hashlib
import json
import os
import threading
import time

SALT = os.getenv("LOG_SALT", "change-me")


def hid(value: str) -> str:
    return hashlib.sha256((SALT + value).encode()).hexdigest()[:12]


class AuditLog:
    def __init__(self, path: str):
        self.path = path
        self.lock = threading.Lock()
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    def write(self, event: str, **fields):
        rec = {"ts": round(time.time(), 3), "event": event}
        rec.update(fields)
        with self.lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
