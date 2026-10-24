# Results (PROVISIONAL)

Measured on **held-out actors**: every 5th actor of CREMA-D and RAVDESS is never used for training.
This is a **provisional run on 5 of 15 feature parts (about 30% of the planned clips)**; the full run replaces these numbers.

| Item | Value |
|---|---|
| Training clips | 1,770 |
| Test clips (unseen actors) | 330 |
| Accuracy, 5 classes (chance = 0.20) | **0.791** |
| CREMA-D test accuracy | 0.742 (n = 221) |
| RAVDESS test accuracy | 0.89 (n = 109) |

Per-class recall: anger 0.91, fear / nervousness 0.63, sad (distress) 0.68, neutral 0.93, happy 0.80.

Confusion matrix (rows = true, columns = predicted; order ANG, FEA, SAD, NEU, HAP):

```
[[64  1  0  1  4]
 [ 4 50 19  1  5]
 [ 1  4 40 12  2]
 [ 0  2  2 67  1]
 [ 3  1  1  5 40]]
```

Fear is often predicted as sad (19 of 79) and sad as neutral (12 of 59). Anger, fear and sad all count towards the urgency signal.
Grouping the same matrix into "anger / fear / sad" versus "neutral / happy" gives 296 of 330 correct (about 0.90). This is derived from the confusion matrix, not a separate evaluation.

## Limits (read before trusting any number)
- Data is **acted** emotional speech (English, studio-style). Real distressed phone calls are different; accuracy on them is unknown and probably lower.
- Small test set (330 clips). TESS (2 speakers) is used for training only.
- "Nervousness" has no label of its own and is approximated by the fear class.
- The urgency cut-offs (40 / 70) are heuristic and are not calibrated on real calls.
- Telephone codecs, noise and Hindi / Gujarati speech were not evaluated for emotion.

Reproduce: `training/embed_features.py` then `training/train_head.py` (see README).
