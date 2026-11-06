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

## Cross-corpus test and calibration (final round, clean features, acted English speech)
**Leave-one-corpus-out** (train on two corpora, test on the third, so both speakers and recording style are new). Chance = 0.20.

| Test corpus | Clips | Accuracy | Recall ANG / FEA / SAD / NEU / HAP |
|---|---|---|---|
| CREMA-D | 3085 | **0.506** | 0.68 / 0.35 / 0.15 / 0.92 / 0.47 |
| RAVDESS | 1056 | **0.378** | 0.81 / 0.98 / 0.02 / 0.11 / 0.09 |
| TESS | 1999 | **0.558** | 0.95 / 0.04 / 0.96 / 0.40 / 0.44 |

Reading: the 0.807 figure holds only when the test speakers come from the same corpora as the training speakers. On a corpus never seen in training, accuracy falls to 0.38 to 0.56 and some classes collapse (for example sad on RAVDESS 0.02, fear on TESS 0.04). Corpora label and act emotions differently and TESS has only 2 speakers, so this is a harsh test, but it shows how much the 0.807 depends on matching conditions. Real calls will be harder still.

**Can it be improved? Per-corpus feature normalisation (offline experiment, not in the live app).** Subtracting each corpus' own mean and dividing by its own std of the features, then repeating leave-one-corpus-out (`training/domain_normalisation.py`):

| Setting | CREMA-D | RAVDESS | TESS | Mean |
|---|---|---|---|---|
| Baseline, C=0.1 | 0.506 | 0.378 | 0.558 | 0.481 |
| Baseline, C=0.01 | 0.515 | 0.371 | 0.566 | 0.484 |
| Per-corpus normalised, C=0.1 | 0.559 | 0.636 | 0.750 | 0.648 |
| Per-corpus normalised, C=0.01 | 0.563 | 0.642 | 0.771 | 0.659 |

Reading: normalising features per recording domain lifts the mean cross-corpus accuracy from about 0.48 to about 0.65, so much of the drop is recording-condition shift that can be reduced. Caveats: (1) it uses unlabeled statistics of the target corpus, including its class mix, so it is a domain-adaptation result, not a zero-knowledge test; (2) it must be computed over many calls from the same deployment or phone line, NOT per call, because per-call normalisation would remove the call's own emotional level; (3) it is not in the live demo, which uses the plain head. It is a concrete next step: collect unlabeled audio from the real line and compute the statistics there.

**Calibration on the held-out-actor test set** (855 clips, same split as above):
- Expected calibration error (top-class probability): 0.103.
- Low-confidence flag (top-class probability below 0.50): fires on 2.6% of windows (about 22 clips). Accuracy on confident windows 0.819, on flagged windows 0.364 (small sample). So the flag points to less reliable windows, but it fires rarely on clean test audio.

**Urgency cut-offs** (urgent = true anger, fear or sad; same test set):

| Urgency >= | Share flagged | Precision | Recall |
|---|---|---|---|
| 40 | 0.589 | 0.929 | 0.895 |
| 50 | 0.571 | 0.945 | 0.881 |
| 60 | 0.553 | 0.947 | 0.857 |
| 70 | 0.539 | 0.954 | 0.841 |
| 80 | 0.527 | 0.958 | 0.826 |
| 90 | 0.491 | 0.971 | 0.780 |

Reading: on same-style speakers the cut-offs change precision only slightly (0.93 to 0.97), so 40 and 70 are not sharply different categories; they are heuristic bands. These figures are for emotion classes, not for real urgency, and the cross-corpus result above suggests they would be lower on new conditions. Script: `training/cross_corpus_calibration.py`.

## Informal observations (single clips, not measurements)
- A calm phone recording was read as calm; a deliberately exaggerated angry English clip was read as anger.
- Live microphone on a laptop showed anger for calm speech (microphone / noise domain shift). The same speech through a phone microphone followed the change from calm to angry.
- Intermediate windows can show "happy" for high-energy speech: the model tracks vocal arousal better than the exact emotion.

## Limits (read before trusting any number)
- Training data is **acted** emotional speech (English, studio-style). Real distressed phone calls are different; accuracy on them is unknown and probably lower.
- Test actors come from the same datasets and recording style as the training actors, so 0.807 is optimistic: leave-one-corpus-out accuracy is only 0.38 to 0.56 (see above).
- "Nervousness" has no label of its own and is approximated by the fear class.
- The urgency cut-offs (40 / 70) are heuristic and not calibrated on real calls.
- Real telephone calls, other codecs, laptop microphones and Hindi / Gujarati speech were not evaluated for emotion (a simulated phone line is reported above).

Reproduce: `training/embed_features.py` then `training/train_head.py` (see README).
