#!/usr/bin/env python3
"""Optional librosa beat and onset tracker.

The studio uses a built-in tracker unless you pass --analyzer python.
Install the extra with: pip install -r requirements-audio.txt
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: analyze_audio.py input.wav output.json\n")
        sys.exit(1)
    try:
        import librosa
    except ImportError:
        sys.stderr.write("librosa is not installed. Run: pip install -r requirements-audio.txt\n")
        sys.exit(2)

    source, destination = sys.argv[1], sys.argv[2]
    samples, sample_rate = librosa.load(source, sr=22050, mono=True)
    onset_frames = librosa.onset.onset_detect(y=samples, sr=sample_rate, units="frames")
    onset_times = librosa.frames_to_time(onset_frames, sr=sample_rate)
    tempo, beat_frames = librosa.beat.beat_track(y=samples, sr=sample_rate)
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate)
    try:
        bpm = float(tempo)
    except TypeError:
        bpm = float(tempo[0])
    payload = {
        "source": "librosa",
        "sampleRate": int(sample_rate),
        "durationSec": round(float(len(samples) / sample_rate), 3),
        "bpm": round(bpm, 1),
        "onsets": [round(float(item), 3) for item in onset_times],
        "beats": [round(float(item), 3) for item in beat_times],
    }
    with open(destination, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
