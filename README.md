# MOM Agent

100% Node.js / Electron desktop app that automates meeting minutes generation for any video call — Teams, Google Meet, Zoom, Slack, etc.

Captures system audio and microphone natively in Electron -> transcribes and generates structured Minutes of Meeting (MOM) directly using Google Gemini. **Zero Python required.**

## Features
- **Zero Python / Zero C++ Dependencies:** Runs completely within Electron and Node.js. Works out of the box on any Windows PC.
- **Full Call Audio Capture:** Mixes system loopback audio and your microphone via Web Audio API.
- **Multimodal AI Processing:** Direct Gemini API calls for timestamped transcription and structured MOM (summary, key discussion points, decisions, action items with owners).
- **Session History & Archive:** Stored locally under `~/.mom-agent/` with search, transcript inspection, and JSON exports.

## Development

```bash
npm install
npm start
```

## Packaging

```bash
npm run make
```
Outputs standalone portable zip and Windows installer into `out/make/`.

## Requirements
- Node.js 18+ (for local development)
- Google Gemini API Key (get one free at [Google AI Studio](https://aistudio.google.com/))
