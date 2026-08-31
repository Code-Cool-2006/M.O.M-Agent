"""Local, offline transcription using faster-whisper."""
import os

WHISPER_MODEL = os.environ.get("MOM_WHISPER_MODEL", "small")  # tiny/base/small/medium


def transcribe(wav_path: str) -> str:
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(wav_path, beam_size=5)

    lines = []
    for seg in segments:
        ts = f"[{_fmt_ts(seg.start)}]"
        lines.append(f"{ts} {seg.text.strip()}")
    return "\n".join(lines)


def _fmt_ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
