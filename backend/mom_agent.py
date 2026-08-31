#!/usr/bin/env python3
"""
MOM Agent - CLI entrypoint.

Usage:
    python mom_agent.py start --title "Sprint Planning"
    python mom_agent.py stop

`start` spawns a background process that records system audio (loopback) +
mic until `stop` is called. `stop` ends the recording, transcribes it with
local Whisper, and generates a structured MOM with Gemini.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

STATE_DIR = Path.home() / ".mom-agent"
STATE_FILE = STATE_DIR / "state.json"
STOP_FLAG = STATE_DIR / "stop.flag"


def _load_dotenv():
    """Tiny .env loader so we don't need the python-dotenv dependency."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


_load_dotenv()


def cmd_start(args):
    STATE_DIR.mkdir(exist_ok=True)
    if STATE_FILE.exists():
        print("A session already appears to be running. Run 'stop' first, "
              "or delete", STATE_FILE, "if this is stale.")
        sys.exit(1)

    if STOP_FLAG.exists():
        STOP_FLAG.unlink()

    session_dir = STATE_DIR / f"session_{int(time.time())}"
    session_dir.mkdir(parents=True)
    wav_path = session_dir / "audio.wav"

    worker = Path(__file__).parent / "capture.py"
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS

    proc = subprocess.Popen(
        [sys.executable, str(worker), "--out", str(wav_path), "--stop-flag", str(STOP_FLAG)],
        creationflags=creationflags,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    state = {
        "pid": proc.pid,
        "title": args.title or "Meeting",
        "wav_path": str(wav_path),
        "session_dir": str(session_dir),
        "started_at": time.time(),
    }
    STATE_FILE.write_text(json.dumps(state, indent=2))
    print(f"Recording started (pid {proc.pid}). Title: {state['title']}")
    print(f"Audio -> {wav_path}")
    print("Run 'python mom_agent.py stop' when the meeting ends.")


def cmd_stop(args):
    if not STATE_FILE.exists():
        print("No active session found.")
        sys.exit(1)

    state = json.loads(STATE_FILE.read_text())
    print("Stopping recording...")
    STOP_FLAG.touch()

    pid = state["pid"]
    for _ in range(100):  # wait up to ~20s for the worker to flush and exit
        if not _pid_alive(pid):
            break
        time.sleep(0.2)
    else:
        print("Warning: recorder didn't exit cleanly, proceeding anyway.")

    STATE_FILE.unlink(missing_ok=True)
    if STOP_FLAG.exists():
        STOP_FLAG.unlink()

    wav_path = state["wav_path"]
    if not Path(wav_path).exists() or Path(wav_path).stat().st_size == 0:
        print("No audio was captured — nothing to process.")
        sys.exit(1)

    print("Transcribing (local Whisper)...")
    from transcribe import transcribe
    transcript = transcribe(wav_path)
    transcript_path = Path(state["session_dir"]) / "transcript.txt"
    transcript_path.write_text(transcript, encoding="utf-8")
    print(f"Transcript -> {transcript_path}")

    print("Generating MOM with Gemini...")
    from summarize import generate_mom
    mom = generate_mom(transcript, title=state["title"])
    mom_path = Path(state["session_dir"]) / "mom.json"
    mom_path.write_text(json.dumps(mom, indent=2), encoding="utf-8")
    print(f"MOM -> {mom_path}")
    print("Done.")


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if h:
            ctypes.windll.kernel32.CloseHandle(h)
            return True
        return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def main():
    parser = argparse.ArgumentParser(description="MOM Agent")
    sub = parser.add_subparsers(dest="command", required=True)

    p_start = sub.add_parser("start", help="Start recording a meeting")
    p_start.add_argument("--title", help="Meeting title", default=None)
    p_start.set_defaults(func=cmd_start)

    p_stop = sub.add_parser("stop", help="Stop recording and process the MOM")
    p_stop.set_defaults(func=cmd_stop)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
