"""Speech-emotion model (indicative signals only).

Pipeline (identical to training):
  16 kHz mono wave -> first 6 s -> per-clip mean/variance normalisation
  -> XLS-R 300M hidden states (layers 8, 16, last) -> mean + std per layer (concatenated, 6144-dim)
  -> StandardScaler -> multinomial logistic regression -> probabilities over 5 classes.

The classifier is stored as plain numbers in an .npz file (scikit-learn is not needed at serving time).
"""
import threading
import time

import numpy as np

SR = 16000
MAX_SEC = 6
MODEL_NAME = "facebook/wav2vec2-xls-r-300m"

CLASSES = ["ANG", "FEA", "SAD", "NEU", "HAP"]
LABELS = {"ANG": "Anger", "FEA": "Fear / nervousness", "SAD": "Distress (sad)",
          "NEU": "Calm / neutral", "HAP": "Happy"}
NEGATIVE = ("ANG", "FEA", "SAD")

HIGH_AT, MEDIUM_AT = 70.0, 40.0     # heuristic, NOT calibrated on real calls


def softmax(z):
    z = np.asarray(z, dtype=np.float64)
    e = np.exp(z - z.max())
    return e / e.sum()


def urgency_from_probs(p):
    """Urgency signal 0-100 = probability mass on anger + fear + distress."""
    return 100.0 * sum(p[c] for c in NEGATIVE)


def level_of(u):
    return "HIGH" if u >= HIGH_AT else ("MEDIUM" if u >= MEDIUM_AT else "LOW")


class EmotionModel:
    def __init__(self, npz_path, device="cpu", fake_embedder=False):
        z = np.load(npz_path)
        self.mean = z["mean"].astype(np.float32)
        self.scale = z["scale"].astype(np.float32)
        self.coef = z["coef"].astype(np.float32)             # (n_classes, 6144)
        self.bias = z["intercept"].astype(np.float32)        # (n_classes,)
        self.classes = [str(c) for c in z["classes"]]
        self.fake_embedder = fake_embedder                    # tests only
        self.lock = threading.Lock()
        self.device = "cpu"
        if not fake_embedder:
            self._load_model(device)

    def _load_model(self, device):
        import torch
        from transformers import Wav2Vec2Model
        self.torch = torch
        self.device = "cuda" if (device == "cuda" and torch.cuda.is_available()) else "cpu"
        self.model = Wav2Vec2Model.from_pretrained(MODEL_NAME).to(self.device).eval()
        if self.device == "cuda":
            self.model.half()

    def embed(self, wave):
        w = np.asarray(wave, dtype=np.float32)[: SR * MAX_SEC]
        if len(w) < SR // 2:
            w = np.pad(w, (0, SR // 2 - len(w)))
        if self.fake_embedder:
            rng = np.random.RandomState(int(np.abs(w).sum() * 1000) % (2 ** 31))
            return rng.randn(6144).astype(np.float32)
        w = (w - w.mean()) / np.sqrt(w.var() + 1e-7)
        torch = self.torch
        with self.lock, torch.no_grad():
            x = torch.from_numpy(w)[None].to(self.device)
            if self.device == "cuda":
                x = x.half()
            hs = self.model(x, output_hidden_states=True).hidden_states
            f = []
            for L in (8, 16, -1):
                h = hs[L][0].float()
                f += [h.mean(0), h.std(0)]
            return torch.cat(f).cpu().numpy()

    def probs_from_vec(self, v):
        x = (np.asarray(v, dtype=np.float32) - self.mean) / self.scale
        p = softmax(x @ self.coef.T + self.bias)
        return {c: float(p[i]) for i, c in enumerate(self.classes)}

    def analyze(self, wave):
        t0 = time.time()
        p = self.probs_from_vec(self.embed(wave))
        u = urgency_from_probs(p)
        top = max(p, key=p.get)
        return {"probs": {c: round(v, 3) for c, v in p.items()}, "top": top, "top_label": LABELS.get(top, top),
                "urgency": round(u, 1), "level": level_of(u), "latency_ms": int((time.time() - t0) * 1000)}
