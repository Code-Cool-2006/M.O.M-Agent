"""Offline transcription with faster-whisper, with automatic fallback to Gemini Audio."""
import base64
import os
import re
from pathlib import Path

import requests

WHISPER_MODEL = os.environ.get("MOM_WHISPER_MODEL", "small")


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


def transcribe(wav_path: str) -> str:
    wav_file = Path(wav_path)
    if not wav_file.exists() or wav_file.stat().st_size == 0:
        return ""

    # 1. Attempt faster-whisper first
    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(str(wav_file), beam_size=5)

        lines = []
        for seg in segments:
            ts = f"[{_fmt_ts(seg.start)}]"
            lines.append(f"{ts} {seg.text.strip()}")
        return "\n".join(lines)
    except Exception as e:
        # Fallback to Gemini audio transcription (e.g. if DLL blocked on Windows or missing libs)
        print(f"Faster-whisper unavailable ({e}), using Gemini audio transcription fallback...")
        return _transcribe_with_gemini(wav_file)


def _transcribe_with_gemini(wav_path: Path) -> str:
    _load_env_fallback()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set for transcription fallback")

    model = os.environ.get("MOM_GEMINI_MODEL", "gemini-3.6-flash")
    if model == "gemini-2.0-flash":
        model = "gemini-3.6-flash"

    prompt = (
        "Transcribe all spoken human speech accurately and verbatim with approximate timestamps "
        "in the format [HH:MM:SS] Spoken text. If there is no audible human speech in the recording, "
        "reply only with: [NO_SPEECH]."
    )

    file_size = wav_path.stat().st_size
    # If smaller than 15MB, use fast inlineData
    if file_size <= 15 * 1024 * 1024:
        b64_audio = base64.b64encode(wav_path.read_bytes()).decode("utf-8")
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": "audio/wav", "data": b64_audio}},
                    ]
                }
            ]
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        resp = requests.post(url, params={"key": api_key}, json=payload, timeout=180)
        resp.raise_for_status()
        res_json = resp.json()
        text = res_json["candidates"][0]["content"]["parts"][0]["text"].strip()
        return "" if text == "[NO_SPEECH]" else text

    # For larger audio files, upload via Gemini File API
    upload_url = f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={api_key}"
    headers = {
        "X-Goog-Upload-Command": "start, upload, finalize",
        "X-Goog-Upload-Header-Content-Type": "audio/wav",
        "Content-Length": str(file_size),
    }
    with open(wav_path, "rb") as f:
        up_resp = requests.post(upload_url, headers=headers, data=f, timeout=300)
    up_resp.raise_for_status()
    file_info = up_resp.json().get("file", {})
    file_uri = file_info.get("uri")
    file_name = file_info.get("name")

    try:
        gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"fileData": {"fileUri": file_uri, "mimeType": "audio/wav"}},
                    ]
                }
            ]
        }
        gen_resp = requests.post(gen_url, json=payload, timeout=300)
        gen_resp.raise_for_status()
        text = gen_resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        return "" if text == "[NO_SPEECH]" else text
    finally:
        if file_name:
            try:
                requests.delete(f"https://generativelanguage.googleapis.com/v1beta/{file_name}?key={api_key}", timeout=10)
            except Exception:
                pass


def _fmt_ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
