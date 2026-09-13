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
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

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

    loopback_mic = None
    try:
        speaker = sc.default_speaker()
        if speaker:
            loopback_mic = sc.get_microphone(id=str(speaker.name), include_loopback=True)
    except Exception:
        pass

    real_mic = None
    try:
        real_mic = sc.default_microphone()
    except Exception:
        pass

    if not loopback_mic and not real_mic:
        raise RuntimeError("No audio output loopback or microphone available.")

    with sf.SoundFile(out_path, mode="w", samplerate=SAMPLE_RATE, channels=1, subtype="PCM_16") as f:
        loop_cm = loopback_mic.recorder(samplerate=SAMPLE_RATE, channels=1) if loopback_mic else None
        mic_cm = real_mic.recorder(samplerate=SAMPLE_RATE, channels=1) if real_mic else None

        loop_rec = loop_cm.__enter__() if loop_cm else None
        mic_rec = mic_cm.__enter__() if mic_cm else None

        try:
            while not stop_flag.exists():
                if loop_rec and mic_rec:
                    loop_data = loop_rec.record(numframes=BLOCK_SIZE)
                    mic_data = mic_rec.record(numframes=BLOCK_SIZE)
                    n = min(len(loop_data), len(mic_data))
                    mixed = (loop_data[:n] + mic_data[:n]) / 2.0
                elif loop_rec:
                    mixed = loop_rec.record(numframes=BLOCK_SIZE)
                else:
                    mixed = mic_rec.record(numframes=BLOCK_SIZE)

                mixed = np.clip(mixed, -1.0, 1.0)
                f.write(mixed)
        finally:
            if loop_cm:
                try:
                    loop_cm.__exit__(None, None, None)
                except Exception:
                    pass
            if mic_cm:
                try:
                    mic_cm.__exit__(None, None, None)
                except Exception:
                    pass


if __name__ == "__main__":
    main()
