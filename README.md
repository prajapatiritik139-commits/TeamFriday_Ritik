# CallSense - Team Friday

Real-time speech-emotion signals to help cybercrime officers **prioritise calls**.
Built for the VecnaVerse hackathon (Cybersecurity: *Real-Time Speech Emotion Analysis for Cybercrime Investigation*).

> Emotion output is an **indicative signal**, never evidence of a person's intent, honesty or guilt.

## What it does
- Analyses **live** (microphone / WebSocket stream) or **recorded** call audio in 6-second windows.
- Reports probabilities for 5 vocal-emotion classes: anger, fear (approximates nervousness), distress (sad), neutral, happy.
- Computes an **urgency signal** (0-100 = probability mass on anger + fear + distress) and a **priority level** (LOW / MEDIUM / HIGH).
- **Smoothing:** HIGH needs 2 of the last 3 windows to be HIGH, so one noisy window cannot escalate a call.
- **Call queue** sorted by priority; calls can be forgotten at any time.
- Optional **synthetic-voice flag** from the separate VoiceGuard API (`VOICEGUARD_URL`), so officers also see whether the voice may be AI-generated.

## Privacy
Audio is decoded and analysed in memory only. The audit log holds hashed call ids, scores and timings: no audio, transcripts or embeddings.

## Method
XLS-R 300M (frozen) hidden states from layers 8, 16 and the last layer, mean + std per layer (6144 dims),
then a StandardScaler + multinomial logistic regression head. The head is exported as plain numpy, so serving needs no scikit-learn.

## Train (Kaggle, 2 x T4)
```
python training/embed_features.py              # GPU 0
CUDA_VISIBLE_DEVICES=1 python training/embed_features.py --reverse   # optional second worker
python training/train_head.py                  # writes emotion_head.npz and results.json
```
Datasets: CREMA-D, RAVDESS (speech), TESS (public Kaggle datasets; acted emotional speech). Test = held-out actors.

## Pre-existing component
The optional synthetic-voice flag calls **VoiceGuard**, a separate voice-clone detection API built earlier by the same team
for another problem statement. It is used only through its REST API (`app/voiceguard.py`); its code is not part of this repository.
Everything else here (emotion model, training scripts, API, dashboard) was built during this hackathon.

## Run
```
pip install -r requirements.txt        # needs ffmpeg and (for the real model) torch
MODEL_NPZ=model/emotion_head.npz API_KEY=choose-a-key DEVICE=cuda \
  uvicorn app.main:app --host 0.0.0.0 --port 8001
```
Open `/` for the dashboard, `/docs` for the API. Optional: `VOICEGUARD_URL`, `VOICEGUARD_KEY`.
Logic tests: `python tests/test_logic.py`.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, classes |
| POST | `/v1/analyze` | audio file -> per-window emotions, urgency, priority, optional voice flag |
| WS | `/v1/stream/{call_id}?api_key=&label=` | PCM16 16 kHz mono in, rolling scores out |
| GET | `/v1/queue` | active calls by priority |
| GET / DELETE | `/v1/call/{id}` | rolling state / forget |
| GET | `/v1/admin/stats` | counters, latency, privacy flags |

## Results and limits
Held-out-actor results are written by `training/train_head.py` to `results.json` and listed in `RESULTS.md` once training has finished. Main limits: training data is acted English speech, not real distressed calls;
"nervousness" has no label of its own; the LOW/MEDIUM/HIGH cut-offs are heuristic and not calibrated on real calls.
