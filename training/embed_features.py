"""Step 1: build the clip list and extract XLS-R features (resumable).

Usage (Kaggle, GPU):  python training/embed_features.py [--reverse]
Datasets expected under /kaggle/input/datasets/**: CREMA-D (ejlok1/cremad), RAVDESS speech (uwrfkaggler), TESS (ejlok1).
Output: $OUT/items.json and $OUT/parts/*.npy (500 clips each, 6144-dim features).
Run a second copy with --reverse on another GPU to halve the time.
"""
import glob
import json
import os
import random
import re
import sys

import numpy as np

OUT = os.environ.get("OUT", "/kaggle/working/callsense")
CLASSES = ["ANG", "FEA", "SAD", "NEU", "HAP"]
RAV = {"01": "NEU", "02": "NEU", "03": "HAP", "04": "SAD", "05": "ANG", "06": "FEA"}
TES = {"angry": "ANG", "fear": "FEA", "sad": "SAD", "neutral": "NEU", "happy": "HAP"}
CH = 500


def discover():
    items, seen = [], set()
    for p in sorted(glob.glob("/kaggle/input/datasets/**/*.wav", recursive=True)):
        if "ritikprajapat2" in p:          # skip the voice-clone calibration datasets
            continue
        b = os.path.basename(p)
        m = re.match(r"^(\d{4})_[A-Za-z]+_(ANG|DIS|FEA|HAP|NEU|SAD)_", b)
        if m:
            if m.group(2) in CLASSES:
                items.append((p, "cremad", m.group(1), m.group(2)))
            continue
        m = re.match(r"^(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)\.wav$", b)
        if m:
            if m.group(1) == "03" and m.group(2) == "01" and m.group(3) in RAV:
                items.append((p, "ravdess", m.group(7), RAV[m.group(3)]))
            continue
        m = re.match(r"^(OAF|YAF)_.+_([a-z]+)\.wav$", b)
        if m and m.group(2) in TES and ("tess", b) not in seen:
            seen.add(("tess", b))
            items.append((p, "tess", m.group(1), TES[m.group(2)]))
    # to save time: keep a random half of CREMA-D (fixed seed)
    crema = [i for i in items if i[1] == "cremad"]
    rest = [i for i in items if i[1] != "cremad"]
    random.Random(0).shuffle(crema)
    items = crema[: len(crema) // 2] + rest
    random.Random(1).shuffle(items)
    return items


def main():
    os.makedirs(OUT + "/parts", exist_ok=True)
    fn = OUT + "/items.json"
    if not os.path.exists(fn):
        json.dump(discover(), open(fn, "w"))
    items = json.load(open(fn))
    print(len(items), "clips", flush=True)

    import soundfile as sf
    import torch
    import torchaudio.functional as AF
    from transformers import Wav2Vec2Model
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print("device", dev, flush=True)
    model = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-xls-r-300m").to(dev).eval()
    if dev == "cuda":
        model = model.half()

    def embed(path):
        w, sr = sf.read(path, dtype="float32", always_2d=True)
        w = w.mean(1)
        if sr != 16000:
            w = AF.resample(torch.from_numpy(w), sr, 16000).numpy()
        w = w[: 16000 * 6]
        if len(w) < 8000:
            w = np.pad(w, (0, 8000 - len(w)))
        w = (w - w.mean()) / np.sqrt(w.var() + 1e-7)
        x = torch.from_numpy(w)[None].to(dev)
        if dev == "cuda":
            x = x.half()
        with torch.no_grad():
            hs = model(x, output_hidden_states=True).hidden_states
        f = []
        for L in (8, 16, -1):
            h = hs[L][0].float()
            f += [h.mean(0), h.std(0)]
        return torch.cat(f).cpu().numpy()

    starts = list(range(0, len(items), CH))
    if "--reverse" in sys.argv:
        starts.reverse()
    for c in starts:
        part = OUT + "/parts/%04d.npy" % (c // CH)
        if os.path.exists(part):
            continue
        arr = []
        for it in items[c:c + CH]:
            try:
                arr.append(embed(it[0]))
            except Exception:
                arr.append(np.full(6144, np.nan, dtype=np.float32))
        np.save(part, np.stack(arr).astype("float32"))
        print(c + len(arr), "/", len(items), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
