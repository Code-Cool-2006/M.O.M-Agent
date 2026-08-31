#!/usr/bin/env python3
"""
Background recorder. Captures system audio loopback (what's playing, i.e.
the call audio) mixed with the default microphone, writes to a WAV file
in chunks, and exits when the stop-flag file appears.

Uses `soundcard`, which supports loopback recording on both Windows and
Linux (PulseAudio/PipeWire) with the same API.
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import soundcard as sc
import soundfile as sf

SAMPLE_RATE = 48000
BLOCK_SIZE = 4096


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--stop-flag", required=True)
    args = ap.parse_args()

    out_path = Path(args.out)
    stop_flag = Path(args.stop_flag)

    speaker = sc.default_speaker()
    loopback_mic = sc.get_microphone(id=str(speaker.name), include_loopback=True)
    try:
        real_mic = sc.default_microphone()
    except Exception:
        real_mic = None

    with sf.SoundFile(out_path, mode="w", samplerate=SAMPLE_RATE, channels=1, subtype="PCM_16") as f:
        with loopback_mic.recorder(samplerate=SAMPLE_RATE, channels=1) as loop_rec:
            mic_rec_cm = real_mic.recorder(samplerate=SAMPLE_RATE, channels=1) if real_mic else None
            mic_rec = mic_rec_cm.__enter__() if mic_rec_cm else None
            try:
                while not stop_flag.exists():
                    loop_data = loop_rec.record(numframes=BLOCK_SIZE)
                    if mic_rec is not None:
                        mic_data = mic_rec.record(numframes=BLOCK_SIZE)
                        n = min(len(loop_data), len(mic_data))
                        mixed = (loop_data[:n] + mic_data[:n]) / 2.0
                    else:
                        mixed = loop_data
                    mixed = np.clip(mixed, -1.0, 1.0)
                    f.write(mixed)
            finally:
                if mic_rec_cm:
                    mic_rec_cm.__exit__(None, None, None)


if __name__ == "__main__":
    main()
