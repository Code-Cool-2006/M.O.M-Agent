# MOM Agent

Manually-triggered meeting minutes automation for any video call — Teams, Google Meet, Zoom, etc.
Records system audio while you're in the call -> transcribes locally with
Whisper -> generates structured MOM with Gemini.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env              # then fill in GEMINI_API_KEY
```

### Linux audio note
Loopback capture needs PulseAudio or PipeWire (both provide a monitor
source that `soundcard` picks up automatically). Default on most modern
distros. Plain ALSA with neither running won't work for loopback.

### Windows audio note
No extra setup needed — WASAPI loopback is used automatically.

## Usage

Join your meeting as normal (Teams, Meet, Zoom — anything), then in a terminal:

```bash
python mom_agent.py start --title "Sprint Planning"
```

When the meeting ends:

```bash
python mom_agent.py stop
```

This transcribes the recording and generates the MOM.
All intermediate files (audio, transcript, MOM json) are saved under
`~/.mom-agent/session_<timestamp>/` for reference.

## Known limitations
- No speaker diarization — MOM won't attribute points to specific speakers
- Attendees list is inferred from what's said, not pulled from the platform's actual roster (no bot/API integration with any specific platform)
- No chunking for very long meetings — a 2+ hour transcript goes to Gemini in one call
