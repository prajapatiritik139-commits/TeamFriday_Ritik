"""Step 2: train the emotion head on the extracted features and report held-out-actor results.

Usage:  python training/train_head.py
Test set = every 5th actor of CREMA-D and RAVDESS (never seen in training). TESS (2 speakers) is train-only.
Output: $OUT/emotion_head.npz (copy it to model/emotion_head.npz) and $OUT/results.json
"""
import glob
import json
import os
from collections import Counter

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, recall_score
from sklearn.preprocessing import StandardScaler

OUT = os.environ.get("OUT", "/kaggle/working/callsense")
CLASSES = ["ANG", "FEA", "SAD", "NEU", "HAP"]

items_all = json.load(open(OUT + "/items.json"))
CH = 500
chunks, items = [], []
for p in sorted(glob.glob(OUT + "/parts/*.npy")):       # parts may be incomplete / non-contiguous
    try:
        arr = np.load(p)
    except Exception:
        continue                                         # a part still being written
    i = int(os.path.basename(p)[:4])
    chunks.append(arr)
    items += items_all[i * CH: i * CH + len(arr)]
X = np.concatenate(chunks)
n_parts = -(-len(items_all) // CH)
print("parts used", len(chunks), "of", n_parts, "| clips", len(X), "of", len(items_all))

keep, seen = [], set()                 # drop failed rows and duplicate RAVDESS files
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
src = np.array([i[1] for i in items])
print("clips per source:", dict(Counter(src.tolist())), "| per class:", dict(Counter(i[3] for i in items)))

test_actors = {}
for s in ("cremad", "ravdess"):
    acts = sorted({i[2] for i in items if i[1] == s})
    test_actors[s] = set(acts[::5])
is_test = np.array([(i[1] in test_actors and i[2] in test_actors[i[1]]) for i in items])
print("train / test clips:", int((~is_test).sum()), int(is_test.sum()))

sc = StandardScaler().fit(X[~is_test])
clf = LogisticRegression(C=0.1, max_iter=3000, class_weight="balanced").fit(sc.transform(X[~is_test]), y[~is_test])
pred = clf.predict(sc.transform(X[is_test]))
yt = y[is_test]
res = {"n_train": int((~is_test).sum()), "n_test": int(is_test.sum()),
       "accuracy": round(float(accuracy_score(yt, pred)), 3), "chance": 0.2,
       "per_source": {}, "recall": dict(zip(CLASSES, np.round(recall_score(yt, pred, average=None), 2).tolist())),
       "confusion": confusion_matrix(yt, pred).tolist(), "classes": CLASSES}
for s in ("cremad", "ravdess"):
    k = src[is_test] == s
    if k.any():
        res["per_source"][s] = {"n": int(k.sum()), "accuracy": round(float(accuracy_score(yt[k], pred[k])), 3)}
print(json.dumps(res, indent=1))
json.dump(res, open(OUT + "/results.json", "w"), indent=1)
np.savez(OUT + "/emotion_head.npz", mean=sc.mean_, scale=sc.scale_, coef=clf.coef_,
         intercept=clf.intercept_, classes=np.array(CLASSES))
print("saved", OUT + "/emotion_head.npz")
