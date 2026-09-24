"""
The reference numbers `features.test.ts` holds `features.ts` to.

WHY A PYTHON SCRIPT IN A TYPESCRIPT TREE
----------------------------------------
Smart Turn was trained on the matrix `transformers.WhisperFeatureExtractor`
makes, so the only honest reference for our extractor is that class itself,
called exactly the way pipecat-ai/smart-turn's `inference.py` calls it. A
fixture typed in by hand, or computed by a second TypeScript implementation,
would only prove the extractor agrees with our own reading of the recipe.
This script is committed beside its output so the fixture can be rebuilt,
and so a reviewer can see precisely what "the reference" was.

It needs numpy and transformers and NOT torch: without torch installed,
`WhisperFeatureExtractor` takes its numpy path (`_np_extract_fbank_features`),
which is float64 throughout. onnxruntime is optional; when present, the
model's own probability for each case is recorded too, which lets
`scripts/smart-turn-check.ts` check the whole browser chain against the
reference chain end to end.

    python3 -m venv /private/tmp/claude-501/smart-turn-venv
    /private/tmp/claude-501/smart-turn-venv/bin/pip install numpy transformers onnxruntime
    /private/tmp/claude-501/smart-turn-venv/bin/python \\
        lib/voice/elevenlabs/smart-turn/fixtures/make_fixture.py \\
        /path/to/speech-16k.wav public/models/smart-turn-v3.2-cpu.onnx

THE SPEECH CLIP
---------------
`speech.wav` is macOS `say` (voice Samantha) reading "I work in logistics,
it's pretty boring.", converted with
`afconvert -f WAVE -d LEI16@16000 -c 1`, and rewritten here with the
standard-library `wave` writer so the test's parser sees a plain 44-byte
header rather than `afconvert`'s 4 KB alignment chunk. Synthesised, so there
is nobody's voice in the repository.

WHAT IS STORED
--------------
The full feature matrix is 64 000 floats per case, half a megabyte of JSON
for two cases. The fixture keeps enough to catch any real defect and stays
small:

  - every row mean (80) and every column mean (800): a wrong mel filter
    shows in a row, a wrong frame offset or window in the columns;
  - the global max and min: the dynamic-range floor is keyed to the max;
  - 2 000 single values at indices (k * 7919) mod 64 000 — 7919 is prime,
    so they are distinct and scattered over the whole matrix;
  - the last 16 frames whole (1 280 values), because the end of the window
    is where the model reads the end of a turn.

Rounded to 6 decimals; the test tolerance is 1e-3.
"""

import json
import sys
import wave

import numpy as np
import transformers
from transformers import WhisperFeatureExtractor

SAMPLE_RATE = 16000
WINDOW = 8 * SAMPLE_RATE
SAMPLED = 2000
SAMPLE_STRIDE = 7919
TAIL_FRAMES = 16


def truncate_audio_to_last_n_seconds(audio_array, n_seconds=8, sample_rate=16000):
    """pipecat-ai/smart-turn `audio_utils.py`, verbatim."""
    max_samples = n_seconds * sample_rate
    if len(audio_array) > max_samples:
        return audio_array[-max_samples:]
    elif len(audio_array) < max_samples:
        padding = max_samples - len(audio_array)
        return np.pad(audio_array, (padding, 0), mode="constant", constant_values=0)
    return audio_array


feature_extractor = WhisperFeatureExtractor(chunk_length=8)


def features(audio):
    """`predict_endpoint` in `inference.py`, up to the ONNX call."""
    audio = truncate_audio_to_last_n_seconds(audio, n_seconds=8)
    inputs = feature_extractor(
        audio,
        sampling_rate=16000,
        return_tensors="np",
        padding="max_length",
        max_length=8 * 16000,
        truncation=True,
        do_normalize=True,
    )
    return inputs.input_features.squeeze(0).astype(np.float32)  # [80, 800]


def synthetic():
    """
    Ten seconds (so the truncation path runs) of a signal with structure in
    every part of the mel range. `features.test.ts` builds the same samples
    from the same formula; float64 then rounded to float32 on both sides.
    """
    t = np.arange(10 * SAMPLE_RATE, dtype=np.float64) / SAMPLE_RATE
    chirp = np.sin(2 * np.pi * (80 * t + 0.5 * 350 * t * t))
    tone = 0.3 * np.sin(2 * np.pi * 1234.5 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.7 * t))
    high = 0.05 * np.sin(2 * np.pi * 6100 * t + 3 * np.sin(2 * np.pi * 5 * t))
    envelope = 0.2 + 0.8 * np.abs(np.sin(2 * np.pi * 0.25 * t))
    return (0.25 * envelope * (chirp + tone) + high).astype(np.float32)


def read_wav16(path):
    with wave.open(path, "rb") as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2 and w.getframerate() == SAMPLE_RATE, path
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    return pcm


def write_wav16(path, pcm):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.astype("<i2").tobytes())


def summarise(matrix):
    flat = matrix.reshape(-1)
    idx = (np.arange(SAMPLED, dtype=np.int64) * SAMPLE_STRIDE) % flat.size
    r = lambda a: [round(float(x), 6) for x in a]
    return {
        "rowMean": r(matrix.astype(np.float64).mean(axis=1)),
        "colMean": r(matrix.astype(np.float64).mean(axis=0)),
        "max": round(float(matrix.max()), 6),
        "min": round(float(matrix.min()), 6),
        "sampled": r(flat[idx]),
        "tail": r(matrix[:, -TAIL_FRAMES:].reshape(-1)),
    }


def main():
    speech_in, model_path = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
    here = __file__.rsplit("/", 1)[0]

    pcm = read_wav16(speech_in)
    write_wav16(f"{here}/speech.wav", pcm)
    speech = pcm.astype(np.float32) / 32768.0

    cases = {"synthetic": synthetic(), "speech": speech}
    session = None
    if model_path:
        try:
            import onnxruntime as ort

            so = ort.SessionOptions()
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            so.inter_op_num_threads = 1
            so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            session = ort.InferenceSession(model_path, sess_options=so)
        except ImportError:
            session = None

    out = {
        "generatedBy": "lib/voice/elevenlabs/smart-turn/fixtures/make_fixture.py",
        "versions": {"transformers": transformers.__version__, "numpy": np.__version__},
        "sampleStride": SAMPLE_STRIDE,
        "tailFrames": TAIL_FRAMES,
        "cases": {},
    }
    for name, audio in cases.items():
        matrix = features(audio)
        assert matrix.shape == (80, 800), matrix.shape
        entry = summarise(matrix)
        entry["samples"] = int(audio.size)
        entry["signalSum"] = float(np.sum(audio.astype(np.float64)))
        if session is not None:
            prob = session.run(None, {"input_features": matrix[None, :, :]})[0]
            entry["probability"] = round(float(np.asarray(prob).reshape(-1)[0]), 6)
        out["cases"][name] = entry

    with open(f"{here}/whisper-features.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")

    # The full matrices, for a one-off exhaustive comparison that is too big
    # to commit (`features.test.ts` reads them when SMART_TURN_FULL is set).
    if len(sys.argv) > 3:
        for name, audio in cases.items():
            features(audio).astype("<f4").tofile(f"{sys.argv[3]}/{name}.f32")


if __name__ == "__main__":
    main()
