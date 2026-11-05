"""Step 3 (final round): how much does accuracy drop on phone-quality audio, and does training on it help?

Real calls arrive over a telephone line (narrow band, noise, codec). Our model was trained on studio-style
acted speech. This script SIMULATES a phone line and measures the effect on the same held-out actors.

Simulation (not real calls): band-pass 300-3400 Hz, 8 kHz sampling, mu-law (G.711 style) quantisation,
plus white noise at a random 10-25 dB SNR (fixed seed).

Usage (Kaggle, GPU, after embed_features.py and train_head.py have run):
    python training/phone_robustness.py
Output: $OUT/phone_results.json and $OUT/emotion_head_phone.npz
Takes about 20-30 minutes on one T4 (it embeds every train and test clip once more).
"""
import glob
import json
import os
from collections import Counter

import numpy as np
from scipy.signal import butter, resample_poly, sosfilt

OUT = os.environ.get("OUT", "/kaggle/working/callsense")
CLASSES = ["ANG", "FEA", "SAD", "NEU", "HAP"]
CH = 500


def phone_degrade(w, rng):
    """w: float32 mono at 16 kHz -> same length, with phone-line artefacts."""
    sos = butter(4, [300, 3400], btype="bandpass", fs=16000, output="sos")
    x = sosfilt(sos, w)
    x = resample_poly(x, 1, 2)                       # 16 kHz -> 8 kHz
    peak = np.max(np.abs(x)) + 1e-7
    x = x / peak
    mu = 255.0                                        # mu-law companding (8-bit like G.711)
    c = np.sign(x) * np.log1p(mu * np.abs(x)) / np.log1p(mu)
    c = np.round((c + 1) / 2 * 255) / 255 * 2 - 1
    x = np.sign(c) * ((1 + mu) ** np.abs(c) - 1) / mu
    x = resample_poly(x, 2, 1)                        # back to 16 kHz for the model
    snr_db = rng.uniform(10, 25)
    p_sig = np.mean(x ** 2) + 1e-9
    noise = rng.standard_normal(len(x)) * np.sqrt(p_sig / (10 ** (snr_db / 10)))
    x = x + noise
    out = np.zeros(len(w), dtype=np.float32)
    n = min(len(w), len(x))
    out[:n] = x[:n]
    return out


def load_clean():
    items_all = json.load(open(OUT + "/items.json"))
    chunks, items = [], []
    for p in sorted(glob.glob(OUT + "/parts/*.npy")):
        try:
            arr = np.load(p)
        except Exception:
            continue
        i = int(os.path.basename(p)[:4])
        chunks.append(arr)
        items += items_all[i * CH: i * CH + len(arr)]
    X = np.concatenate(chunks)
    keep, seen = [], set()
    for k, it in enumerate(items):
        if np.isnan(X[k]).any():
            continue
        key = (it[1], os.path.basename(it[0]))
        if it[1] == "ravdess" and key in seen:
            continue
        seen.add(key)
        keep.append(k)
    X = X[keep]
    items = [items[k] for k in keep]
    return X, items


def split(items):
    test_actors = {}
    for s in ("cremad", "ravdess"):
        acts = sorted({i[2] for i in items if i[1] == s})
        test_actors[s] = set(acts[::5])
    return np.array([(i[1] in test_actors and i[2] in test_actors[i[1]]) for i in items])


def embed_degraded(items):
    import soundfile as sf
    import torch
    import torchaudio.functional as AF
    from transformers import Wav2Vec2Model
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-xls-r-300m").to(dev).eval()
    if dev == "cuda":
        model = model.half()
    rng = np.random.default_rng(0)
    feats = []
    for n, it in enumerate(items):
        try:
            w, sr = sf.read(it[0], dtype="float32", always_2d=True)
            w = w.mean(1)
            if sr != 16000:
                w = AF.resample(torch.from_numpy(w), sr, 16000).numpy()
            w = w[: 16000 * 6]
            if len(w) < 8000:
                w = np.pad(w, (0, 8000 - len(w)))
            w = phone_degrade(w.astype(np.float64), rng)
            w = (w - w.mean()) / np.sqrt(w.var() + 1e-7)
            x = torch.from_numpy(w.astype(np.float32))[None].to(dev)
            if dev == "cuda":
                x = x.half()
            with torch.no_grad():
                hs = model(x, output_hidden_states=True).hidden_states
            f = []
            for L in (8, 16, -1):
                h = hs[L][0].float()
                f += [h.mean(0), h.std(0)]
            feats.append(torch.cat(f).cpu().numpy())
        except Exception:
            feats.append(np.full(6144, np.nan, dtype=np.float32))
        if n % 500 == 0:
            print(n, "/", len(items), flush=True)
    return np.stack(feats).astype("float32")


def main():
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, recall_score
    from sklearn.preprocessing import StandardScaler

    X, items = load_clean()
    y = np.array([CLASSES.index(i[3]) for i in items])
    is_test = split(items)
    print("clips", len(X), "train/test", int((~is_test).sum()), int(is_test.sum()), flush=True)

    cache = OUT + "/phone_feats.npy"
    if os.path.exists(cache):
        P = np.load(cache)
    else:
        P = embed_degraded(items)
        np.save(cache, P)
    ok = ~np.isnan(P).any(1)
    tr, te = (~is_test) & ok, is_test & ok
    print("usable train/test", int(tr.sum()), int(te.sum()), flush=True)

    def fit(Xtr, ytr):
        sc = StandardScaler().fit(Xtr)
        clf = LogisticRegression(C=0.1, max_iter=3000, class_weight="balanced").fit(sc.transform(Xtr), ytr)
        return sc, clf

    def acc(sc, clf, Xte, yte):
        pred = clf.predict(sc.transform(Xte))
        return round(float(accuracy_score(yte, pred)), 3), np.round(recall_score(yte, pred, average=None), 2).tolist()

    res = {"note": "phone line is SIMULATED (300-3400 Hz band-pass, 8 kHz, mu-law, noise 10-25 dB SNR); not real calls",
           "n_train": int(tr.sum()), "n_test": int(te.sum()), "classes": CLASSES}

    sc, clf = fit(X[tr], y[tr])                                   # A: clean-trained head
    res["A_clean_trained__clean_test"] = acc(sc, clf, X[te], y[te])
    res["A_clean_trained__phone_test"] = acc(sc, clf, P[te], y[te])

    Xmix = np.concatenate([X[tr], P[tr]])                         # B: trained on clean + phone
    ymix = np.concatenate([y[tr], y[tr]])
    sc2, clf2 = fit(Xmix, ymix)
    res["B_clean_plus_phone_trained__clean_test"] = acc(sc2, clf2, X[te], y[te])
    res["B_clean_plus_phone_trained__phone_test"] = acc(sc2, clf2, P[te], y[te])

    print(json.dumps(res, indent=1))
    json.dump(res, open(OUT + "/phone_results.json", "w"), indent=1)
    np.savez(OUT + "/emotion_head_phone.npz", mean=sc2.mean_, scale=sc2.scale_, coef=clf2.coef_,
             intercept=clf2.intercept_, classes=np.array(CLASSES))
    print("saved phone_results.json and emotion_head_phone.npz")


if __name__ == "__main__":
    main()
