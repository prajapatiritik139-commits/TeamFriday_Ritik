"""Step 4 (final round): cross-corpus generalisation and calibration. Uses the clean features only (CPU, a few minutes).

Usage:  python training/cross_corpus_calibration.py      (after embed_features.py)
Output: $OUT/cross_corpus_results.json and a printed summary.

A) Leave-one-corpus-out: train on two corpora, test on the third (different speakers AND recording style).
B) On the held-out-actor test set (same split as train_head.py):
   - reliability of the top-class probability (expected calibration error, ECE),
   - accuracy on confident (>= 0.50) vs uncertain (< 0.50) windows -> checks the low-confidence flag,
   - precision / recall of "urgent" (true anger/fear/sad) at several urgency cut-offs -> checks the 40 / 70 levels.
All data is acted English speech; these are still optimistic for real calls.
"""
import glob
import json
import os
from collections import Counter

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, recall_score
from sklearn.preprocessing import StandardScaler

OUT = os.environ.get("OUT", "/kaggle/working/callsense")
CLASSES = ["ANG", "FEA", "SAD", "NEU", "HAP"]
NEG = [0, 1, 2]
CH = 500


def load():
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
    y = np.array([CLASSES.index(i[3]) for i in items])
    return X, y, np.array([i[1] for i in items]), items


def fit(X, y):
    sc = StandardScaler().fit(X)
    clf = LogisticRegression(C=0.1, max_iter=3000, class_weight="balanced").fit(sc.transform(X), y)
    return sc, clf


def main():
    X, y, src, items = load()
    print("clips", len(X), dict(Counter(src.tolist())))
    res = {"note": "acted English speech only; leave-one-corpus-out and calibration on clean features"}

    # A) leave-one-corpus-out
    loco = {}
    for held in sorted(set(src.tolist())):
        te = src == held
        if te.sum() < 50 or (~te).sum() < 200:
            continue
        sc, clf = fit(X[~te], y[~te])
        pred = clf.predict(sc.transform(X[te]))
        rec = recall_score(y[te], pred, labels=range(5), average=None, zero_division=0)
        urg_true = np.isin(y[te], NEG)
        urg_pred = np.isin(pred, NEG)
        loco[held] = {"n_test": int(te.sum()), "accuracy": round(float(accuracy_score(y[te], pred)), 3),
                      "recall": dict(zip(CLASSES, np.round(rec, 2).tolist())),
                      "urgent_vs_not_accuracy": round(float((urg_true == urg_pred).mean()), 3)}
        print("train on others, test on", held, loco[held])
    res["leave_one_corpus_out"] = loco

    # B) calibration on the held-out-actor split (same as train_head.py)
    test_actors = {}
    for s in ("cremad", "ravdess"):
        acts = sorted({i[2] for i in items if i[1] == s})
        test_actors[s] = set(acts[::5])
    is_test = np.array([(i[1] in test_actors and i[2] in test_actors[i[1]]) for i in items])
    sc, clf = fit(X[~is_test], y[~is_test])
    P = clf.predict_proba(sc.transform(X[is_test]))
    yt = y[is_test]
    pred = P.argmax(1)
    conf = P.max(1)
    correct = (pred == yt).astype(float)
    bins = np.linspace(0, 1, 11)
    ece, rel = 0.0, []
    for a, b in zip(bins[:-1], bins[1:]):
        m = (conf > a) & (conf <= b)
        if m.sum():
            ece += m.mean() * abs(conf[m].mean() - correct[m].mean())
            rel.append({"conf_bin": f"{a:.1f}-{b:.1f}", "n": int(m.sum()),
                        "mean_conf": round(float(conf[m].mean()), 3), "accuracy": round(float(correct[m].mean()), 3)})
    unc = conf < 0.50
    res["calibration"] = {"n_test": int(len(yt)), "ece": round(float(ece), 3), "reliability": rel,
                          "uncertain_share": round(float(unc.mean()), 3),
                          "accuracy_confident": round(float(correct[~unc].mean()), 3),
                          "accuracy_uncertain": round(float(correct[unc].mean()), 3) if unc.any() else None}
    urg = 100 * P[:, NEG].sum(1)
    true_urgent = np.isin(yt, NEG)
    cut = {}
    for t in (40, 50, 60, 70, 80, 90):
        f = urg >= t
        tp = float((f & true_urgent).sum())
        cut[str(t)] = {"flagged_share": round(float(f.mean()), 3),
                       "precision": round(tp / max(f.sum(), 1), 3), "recall": round(tp / max(true_urgent.sum(), 1), 3)}
    res["urgency_cutoffs"] = cut
    res["calibration"]["note"] = "confidence cut-off 0.50 and urgency cut-offs 40/70 are heuristic; table shows their behaviour"
    print(json.dumps(res["calibration"], indent=1))
    print(json.dumps(cut, indent=1))
    json.dump(res, open(OUT + "/cross_corpus_results.json", "w"), indent=1)
    print("saved", OUT + "/cross_corpus_results.json")


if __name__ == "__main__":
    main()
