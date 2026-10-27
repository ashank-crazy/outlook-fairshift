"""Generate the voiceover, one WAV per scene, with Kokoro (offline neural TTS).

usage: python tts.py <models_dir> <out_dir> [voice] [speed]
Writes <out_dir>/<id>.wav and <out_dir>/durations.json.
"""
import json
import os
import sys

import espeakng_loader
import soundfile as sf

# espeak-ng truncates long data paths (fixed-size buffer), so expose the bundled
# phoneme data through a short symlink next to this script.
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".espeak-data")
if not os.path.exists(DATA):
    os.symlink(espeakng_loader.get_data_path(), DATA)
os.environ["ESPEAK_DATA_PATH"] = DATA

from kokoro_onnx import EspeakConfig, Kokoro  # noqa: E402

models, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 0.9

here = os.path.dirname(os.path.abspath(__file__))
segments = json.load(open(os.path.join(here, "narration.json")))
os.makedirs(out, exist_ok=True)

kokoro = Kokoro(
    os.path.join(models, "kokoro-v1.0.int8.onnx"),
    os.path.join(models, "voices-v1.0.bin"),
    espeak_config=EspeakConfig(lib_path=espeakng_loader.get_library_path(), data_path=DATA),
)
durations = {}
for seg in segments:
    samples, rate = kokoro.create(seg["text"], voice=voice, speed=speed, lang="en-us")
    path = os.path.join(out, seg["id"] + ".wav")
    sf.write(path, samples, rate)
    durations[seg["id"]] = round(len(samples) / rate, 3)
    print(seg["id"], durations[seg["id"]], "s")

json.dump(durations, open(os.path.join(out, "durations.json"), "w"), indent=2)
print("total", round(sum(durations.values()), 1), "s")
