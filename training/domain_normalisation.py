"""Final-round experiment (offline, NOT used in the live app): does per-corpus feature normalisation help
leave-one-corpus-out accuracy?  Needs the clean features from embed_features.py.  Usage: python training/domain_normalisation.py

Per-corpus z-score = subtract each corpus' own mean and divide by its own std of the 6144 features.
It uses UNLABELED statistics of the target corpus (its class mix included), so it is a domain-adaptation result,
not a fair zero-knowledge test. It must NOT be done per call: that would remove a call's own emotional level.
"""
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cross_corpus_calibration import load  # noqa: E402


def loco(X, y, src, C):
    out = {}
    for held in sorted(set(src.tolist())):
        te = src == held
        sc = StandardScaler().fit(X[~te])
        clf = LogisticRegression(C=C, max_iter=2000, class_weight="balanced").fit(sc.transform(X[~te]), y[~te])
        out[held] = round(float(accuracy_score(y[te], clf.predict(sc.transform(X[te])))), 3)
    out["mean"] = round(float(np.mean(list(out.values()))), 3)
    return out


if __name__ == "__main__":
    X, y, src, _ = load()
    Xz = X.copy()
    for s in set(src.tolist()):
        m = src == s
        Xz[m] = (X[m] - X[m].mean(0)) / (X[m].std(0) + 1e-6)
    for C in (0.1, 0.01):
        print("baseline          C=%s:" % C, loco(X, y, src, C))
        print("per-corpus z-score C=%s:" % C, loco(Xz, y, src, C))
