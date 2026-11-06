# VoxSentra frontend (prototype built in Google AI Studio)

React + Vite single-page app with two tabs:
- **Call Triage** (our hackathon work): talks to the CallSense API in this repository (`/v1/analyze`, `/v1/queue`, `/v1/stream/{id}`, `/v1/call/{id}/report`). Set the API base URL in the app settings.
- **Voice Verification**: client for our earlier VoiceGuard API (separate project; its backend code is not in this repository).

Run: `npm install` then `npm run dev` (Node 20+). The built-in dashboard in `../static/index.html` is served by the CallSense server itself and needs no build.
No API keys are stored in this folder; base URLs and keys are typed into the app and kept only in the browser.
