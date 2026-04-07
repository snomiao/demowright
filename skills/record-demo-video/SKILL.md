---
name: record-demo-video
description: Record a fully automated, narration-driven CLI demo video using Docker, Xvfb, Gemini TTS, and ffmpeg 2-pass post-mix. Use this skill when you need to produce a polished MP4 demo video for a CLI tool — with synchronized voice narration, burned-in subtitles, and an AI-generated thumbnail. The output is reproducible: anyone can docker run and get the same video.
---

# record-demo-video — Automated CLI Demo Video Production

Produce a polished MP4 demo video for a CLI tool using a 2-pass pipeline:
1. **Pass 1**: Record a silent screen capture inside Docker (Xvfb → ffmpeg)
2. **Pass 2**: Pre-generate TTS narration with Gemini, overlay it in post, burn subtitles

The demo script is **narration-driven**: every section waits exactly as long as its TTS audio clip, so audio and video stay in sync without any runtime audio playback.

## Pipeline Overview

```
generate-narration.py  ──►  narration_track.wav + durations.sh + meta.json
         │
         ▼
docker build  (bakes durations.sh into image)
         │
         ▼
docker run  ──►  Xvfb :99 → ffmpeg x11grab → screen-recording.mp4
                 demo.sh (narration-driven, launches xterm + Chrome)
                 record.sh post-mix:
                   adelay = demo_start_ms − ffmpeg_start_ms
                   ffmpeg overlay narration_track.wav
                   burn subtitles from meta.json
         │
         ▼
screen-recording-final.mp4  (video + audio + subtitles)
         │  (optional)
         ▼
ffmpeg concat thumbnail.jpg → final-with-intro.mp4
```

---

## Step 1 — Write the Narration Script

Create `SEGMENTS` in `generate-narration.py` **before** writing the demo script.
Each segment should cover one visual action (5–10 seconds is ideal):

```python
SEGMENTS = [
    ("01_intro",   "Your tool does X — here's how."),
    ("02_launch",  "First, we launch the app with..."),
    ("03_connect", "The CLI connects to the browser..."),
    # ...cover EVERY action, no silent gaps
]
```

Rules:
- Cover every visual section — no gaps, even page loads
- Keep segments 5–10 seconds (shorter = less accumulated drift)
- The narration is the script; write it before the demo actions

---

## Step 2 — Generate TTS Audio

```bash
# Requires GOOGLE_GENERATIVE_AI_API_KEY in .env.local (searched upward from script)
cd docker-demo
python3 generate-narration.py
```

Uses **Gemini TTS** (`gemini-2.5-flash-preview-tts` or newer) with concurrent generation.

Key detail: Gemini TTS returns raw PCM (`audio/L16;codec=pcm;rate=24000`), not WAV.
Must add WAV header with Python's `wave` module before any further processing:

```python
def pcm_to_wav(pcm_bytes, path, rate=24000, channels=1, bits=16):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(channels); w.setsampwidth(bits // 8)
        w.setframerate(rate);     w.writeframes(pcm_bytes)
```

Outputs:
- `narration/*.wav` — one file per segment (cached; re-runs skip existing)
- `narration/narration_track.wav` — all segments concatenated in order
- `narration/durations.sh` — `DUR_01_intro=9890` variables for demo.sh
- `narration/meta.json` — segment text + duration for subtitle generation

---

## Step 3 — Write the Demo Script (narration-driven timing)

The core pattern: `narrate()` logs the timestamp, `narrate_end()` sleeps for whatever time remains in the current segment's audio duration.

```bash
# In demo.sh (sourced from durations.sh first)
narrate() {
  local name="$1"
  local elapsed_ms=$(( $(date +%s%3N) - DEMO_START_MS ))
  local var="DUR_${name//-/_}"
  __NARRATE_DUR_MS="${!var:-4000}"
  echo "${DEMO_START_MS}|${elapsed_ms}|${__NARRATE_DUR_MS}|${2}" >> "${OUTPUT_DIR}/narration_log.txt"
  __NARRATE_START_MS=$(date +%s%3N)
}

narrate_end() {
  local remaining=$(( __NARRATE_DUR_MS - ($(date +%s%3N) - __NARRATE_START_MS) ))
  [ "$remaining" -gt 50 ] && sleep "$(awk "BEGIN{printf \"%.3f\", ${remaining}/1000}")"
}
```

Usage:

```bash
narrate "02_launch" "Launching the app..."
# do visual actions here (they run concurrently with narration timing)
show_cmd 'myapp start'
myapp start &
narrate_end   # sleeps for remaining DUR_02_launch ms
```

**Why this syncs**: segments are concatenated in order in `narration_track.wav`.
The elapsed_ms at each `narrate()` call equals the cumulative duration of all previous segments.
The post-mix applies a single `adelay = (demo_start_ms − ffmpeg_start_ms)` offset.
So every `narrate()` call lands on the correct position in the WAV — no per-segment alignment needed.

---

## Step 4 — Docker Recording Environment

Minimal `Dockerfile` structure:

```dockerfile
FROM node:22-bookworm

RUN apt-get install -y \
    xvfb x11-utils xterm fluxbox ffmpeg xdotool \
    chromium fonts-noto fonts-noto-color-emoji \
    fonts-noto-cjk wget unzip

# ... install your CLI tool and Chrome extension

COPY demo.sh record.sh ./
COPY narration/ ./narration/   # pre-generated TTS audio
CMD ["bash", "record.sh"]
```

`record.sh` entrypoint sequence:

```bash
Xvfb :99 -screen 0 1280x800x24 &
fluxbox -display :99 &
# record FFMPEG_START_MS
ffmpeg -f x11grab -video_size 1280x800 -framerate 30 \
       -i :99.0 -c:v libx264 -preset ultrafast screen-recording.mp4 &
FFMPEG_PID=$!

bash demo.sh | tee demo.log

kill $FFMPEG_PID && wait $FFMPEG_PID

# post-mix: overlay narration_track.wav + burn subtitles
python3 post-mix.py
```

---

## Step 5 — Post-Mix (runs automatically inside record.sh)

```python
# compute delay
audio_delay_ms = demo_start_ms - ffmpeg_start_ms  # typically ~2000ms

# overlay single WAV track
ffmpeg -i video.mp4 -i narration_track.wav \
  -filter_complex f"[1:a]adelay={d}|{d}[aout]" \
  -map 0:v -map "[aout]" -c:v libx264 -c:a aac \
  screen-recording-audio.mp4

# generate subtitles from meta.json (deterministic)
cursor_ms = audio_delay_ms
for seg in meta:
    srt_entry(cursor_ms, cursor_ms + seg['duration_ms'], seg['text'])
    cursor_ms += seg['duration_ms']

# burn subtitles
ffmpeg -i screen-recording-audio.mp4 \
  -vf "subtitles=subs.srt:force_style='FontSize=16,Alignment=2'" \
  -c:a copy screen-recording-final.mp4
```

---

## Step 6 — Generate Thumbnail (optional)

```python
import requests, base64

url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={api_key}"
body = {
    "contents": [{"parts": [{"text": "YouTube tech thumbnail, 16:9, dark background..."}], "role": "user"}],
    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
}
resp = requests.post(url, json=body)
img = base64.b64decode(resp.json()['candidates'][0]['content']['parts'][0]['inlineData']['data'])
open('thumbnail.jpg', 'wb').write(img)
```

Prepend as 3-second static intro frame:

```bash
ffmpeg -y -loop 1 -t 3 -i thumbnail.jpg -i screen-recording-final.mp4 \
  -filter_complex \
    "[0:v]scale=1280:800,setsar=1[t];[1:v]scale=1280:800,setsar=1[m];
     [t][m]concat=n=2:v=1:a=0[v];[1:a]adelay=3000|3000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -c:a aac final.mp4
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| All audio segments play simultaneously | `paplay seg.wav &` during recording | Use 2-pass post-mix; no live audio |
| Silent gap in middle of video | Not enough narration segments | Add segments for every visual action including page loads |
| Wrong tab closed by ctrl+w | Tab focus state is unpredictable with xdotool | Use CLI commands (`tab-select N`) instead of keyboard shortcuts for tab navigation |
| `ERR_BLOCKED_BY_CLIENT` for extension URL | Chrome blocks `chrome-extension://` as startup arg | Pre-launch Chrome with `about:blank`, then open extension tab from within |
| Raw PCM sounds like noise | Gemini TTS returns PCM, not WAV | Add WAV header with `wave` module before saving/using |
| 1–2s drift by end of video | Bash process overhead ~10–50ms/segment | Acceptable for demos; for frame-accurate sync use a visual sync pulse |
| MV2 extension fails to load | Chromium 146+ dropped MV2 support | Switch to MV3 equivalents (uBOL for uBlock, ISDCAC for userscripts) |

---

## Quick Reference: Full Command Sequence

```bash
# 1. Write narration in generate-narration.py, then:
python3 generate-narration.py

# 2. Write demo.sh using narrate()/narrate_end() pattern

# 3. Build and record
docker build -t demo:latest .
mkdir -p output
docker run --rm -v "$(pwd)/output:/output" demo:latest

# 4. View result
open output/screen-recording-final.mp4

# 5. Optional: add thumbnail intro
python3 generate-thumbnail.py
ffmpeg [concat command above] output/final.mp4
```

## Reference Implementation

See `docker-demo/` in this repo for a complete working example covering:
- Chrome extension relay connection
- Multi-tab navigation
- Independent browser sessions
- ~161 seconds, 20 narration segments, 2:44 final video
