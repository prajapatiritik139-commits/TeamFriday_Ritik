"""Decode any audio/video container to 16 kHz mono float32 using ffmpeg. Nothing is kept on disk."""
import os
import subprocess
import tempfile

import numpy as np

SR = 16000


def decode_bytes(data: bytes, max_sec: int = 60) -> np.ndarray:
    fd, path = tempfile.mkstemp(suffix=".bin", dir="/dev/shm" if os.path.isdir("/dev/shm") else None)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        p = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", path, "-t", str(max_sec),
             "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
            capture_output=True, timeout=60)
        if p.returncode != 0 or not p.stdout:
            raise ValueError("could not decode audio: " + p.stderr.decode(errors="ignore")[:200])
        return np.frombuffer(p.stdout, dtype=np.float32).copy()
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
