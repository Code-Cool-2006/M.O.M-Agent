"""Turns a raw transcript into a structured MOM using the Gemini API."""
import json
import os
import re
from pathlib import Path

import requests


def _load_env_fallback():
    if os.environ.get("GEMINI_API_KEY"):
        return
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass


_load_env_fallback()

GEMINI_MODEL = os.environ.get("MOM_GEMINI_MODEL", "gemini-3.6-flash")

PROMPT_TEMPLATE = """You are generating Minutes of Meeting (MOM) from a raw call transcript.
The transcript may contain filler words and transcription errors — ignore those.

Meeting title: {title}

Transcript:
---
{transcript}
---

Return ONLY a JSON object (no markdown fences, no commentary) with this exact schema:
{{
  "title": string,
  "attendees": [string],           // names mentioned in the transcript, best effort
  "agenda": [string],              // topics that were actually discussed
  "discussion_points": [string],   // key points raised, concise bullet-style sentences
  "decisions": [string],           // concrete decisions made
  "action_items": [{{"task": string, "owner": string}}],  // owner "Unassigned" if unclear
  "next_steps": [string]
}}
"""


def generate_mom(transcript: str, title: str) -> dict:
    _load_env_fallback()
    clean_tx = (transcript or "").strip()
    if not clean_tx or clean_tx == "[NO_SPEECH]":
        return {
            "title": title or "Meeting",
            "attendees": [],
            "agenda": ["General discussion"],
            "discussion_points": ["No audible speech detected during the recording."],
            "decisions": [],
            "action_items": [],
            "next_steps": [],
        }

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (configure it in Settings or .env)")

    model = os.environ.get("MOM_GEMINI_MODEL", GEMINI_MODEL)
    if model == "gemini-2.0-flash":
        model = "gemini-3.6-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    prompt = PROMPT_TEMPLATE.format(title=title, transcript=clean_tx)
    resp = requests.post(
        url,
        params={"key": api_key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip()).strip()
    return json.loads(text)
