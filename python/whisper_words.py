#!/usr/bin/env python3
"""Optional local Whisper word timestamps.

Not used unless you pass --whisper. Install with: pip install openai-whisper
This model download is large. The placeholder and ElevenLabs paths do not need it.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: whisper_words.py input.wav output.json\n")
        sys.exit(1)
    try:
        import whisper
    except ImportError:
        sys.stderr.write("openai-whisper is not installed. Run: pip install openai-whisper\n")
        sys.exit(2)

    source, destination = sys.argv[1], sys.argv[2]
    model = whisper.load_model("base")
    result = model.transcribe(source, word_timestamps=True)
    words = []
    for segment in result.get("segments") or []:
        for word in segment.get("words") or []:
            text = str(word.get("word", "")).strip()
            if not text:
                continue
            words.append(
                {
                    "word": text,
                    "start": round(float(word["start"]), 3),
                    "end": round(float(word["end"]), 3),
                }
            )
    payload = {"source": "whisper", "words": words}
    with open(destination, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
