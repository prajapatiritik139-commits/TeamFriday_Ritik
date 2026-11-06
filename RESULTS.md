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

## Phone-line robustness (final round, SIMULATED line, not real calls)
Same 855 held-out-actor test clips, same 5285 training clips. "Phone" = band-pass 300-3400 Hz, 8 kHz resample, mu-law, white noise at random 10-25 dB SNR (seed 0). Script: `training/phone_robustness.py`.

| Head | Clean test | Phone-simulated test |
|---|---|---|
| A: trained on clean audio only (current head) | 0.807 | **0.568** |
| B: trained on clean + phone-simulated audio | 0.785 | **0.757** |

Per-class recall (ANG, FEA, SAD, NEU, HAP):
- A on phone: 0.30, 0.64, 0.89, 0.66, 0.32 (anger and happy collapse, sad is over-predicted)
- B on phone: 0.85, 0.72, 0.65, 0.91, 0.65

Reading: a head trained only on clean audio loses about 24 points on simulated phone audio, and anger recall falls from 0.89 to 0.30. Adding phone-simulated copies to training recovers most of this (0.757 on phone) at a cost of about 2 points on clean audio (0.807 to 0.785). The B head is saved as `emotion_head_phone.npz`. These are simulated degradations of acted speech; real calls (other codecs, packet loss, real distress) are not tested.

## Informal observations (single clips, not measurements)
- A calm phone recording was read as calm; a deliberately exaggerated angry English clip was read as anger.
- Live microphone on a laptop showed anger for calm speech (microphone / noise domain shift). The same speech through a phone microphone followed the change from calm to angry.
- Intermediate windows can show "happy" for high-energy speech: the model tracks vocal arousal better than the exact emotion.

## Limits (read before trusting any number)
- Training data is **acted** emotional speech (English, studio-style). Real distressed phone calls are different; accuracy on them is unknown and probably lower.
- Test actors come from the same datasets and recording style as the training actors, so these numbers are optimistic for real calls.
- "Nervousness" has no label of its own and is approximated by the fear class.
- The urgency cut-offs (40 / 70) are heuristic and not calibrated on real calls.
- Real telephone calls, other codecs, laptop microphones and Hindi / Gujarati speech were not evaluated for emotion (a simulated phone line is reported above).

Reproduce: `training/embed_features.py` then `training/train_head.py` (see README).
