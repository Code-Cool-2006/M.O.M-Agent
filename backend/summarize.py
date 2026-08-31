"""Turns a raw transcript into a structured MOM using the Gemini API."""
import json
import os
import re

import requests

GEMINI_MODEL = os.environ.get("MOM_GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

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
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (put it in your .env)")

    prompt = PROMPT_TEMPLATE.format(title=title, transcript=transcript)
    resp = requests.post(
        GEMINI_URL,
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
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(text)
