# Results

Measured on **held-out actors**: every 5th actor of CREMA-D and RAVDESS is never used for training.
TESS (only 2 speakers) is used for training only. All numbers below come from `training/train_head.py` (full run, all feature parts).

## Data used
| Source | Clips used |
|---|---|
| CREMA-D (random half, fixed seed) | 3,085 |
| RAVDESS speech (duplicates removed) | 1,056 |
| TESS | 1,999 |
| **Total** | **6,140** (anger 1,245 / fear 1,229 / sad 1,220 / neutral 1,242 / happy 1,204) |

Train 5,285 clips, test 855 clips (unseen actors).

## Accuracy (5 classes, chance = 0.20)
| | Accuracy | Test clips |
|---|---|---|
| **All** | **0.807** | 855 |
| CREMA-D | 0.789 | 635 |
| RAVDESS | 0.859 | 220 |

| Class | Recall |
|---|---|
| Anger | 0.89 |
| Fear / nervousness | 0.73 |
| Sad (distress) | 0.69 |
| Neutral | 0.95 |
| Happy | 0.78 |

Confusion matrix (rows = true, columns = predicted; order ANG, FEA, SAD, NEU, HAP):

```
[[147   2   0   4  12]
 [  5 134  24   4  17]
 [  2  24 120  24   4]
 [  1   2   4 165   1]
 [  9   9   2  15 124]]
```

Fear and sad are often confused with each other (24 each way), and sad with neutral (24). Anger, fear and sad all feed the urgency signal.
Grouping the same matrix into "anger / fear / sad" versus "neutral / happy" gives 763 of 855 correct (about 0.89). This is derived from the confusion matrix, not a separate evaluation.

## Informal observations (single clips, not measurements)
- A calm phone recording was read as calm; a deliberately exaggerated angry English clip was read as anger.
- Live microphone on a laptop showed anger for calm speech (microphone / noise domain shift). The same speech through a phone microphone followed the change from calm to angry.
- Intermediate windows can show "happy" for high-energy speech: the model tracks vocal arousal better than the exact emotion.

## Limits (read before trusting any number)
- Training data is **acted** emotional speech (English, studio-style). Real distressed phone calls are different; accuracy on them is unknown and probably lower.
- Test actors come from the same datasets and recording style as the training actors, so these numbers are optimistic for real calls.
- "Nervousness" has no label of its own and is approximated by the fear class.
- The urgency cut-offs (40 / 70) are heuristic and not calibrated on real calls.
- Telephone codecs, noise, laptop microphones and Hindi / Gujarati speech were not evaluated for emotion.

Reproduce: `training/embed_features.py` then `training/train_head.py` (see README).
