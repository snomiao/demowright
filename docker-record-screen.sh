#!/usr/bin/env bash
# docker-record-screen.sh — wrap a Playwright test with full-screen ffmpeg
# x11grab capture, so system UI (file pickers, dialogs) is recorded.
#
# Used by example 08 to capture the native GTK file chooser dialog, which
# Playwright's video recorder cannot see (Playwright records page DOM only).
#
# Usage (inside container, after entrypoint set up Xvfb + fluxbox):
#   docker-record-screen.sh OUTPUT_MP4 -- bunx playwright test ...
#
# Audio is muxed in from the demowright TTS WAV (saved by the test on close).
set -euo pipefail

OUTPUT="${1:-/app/.demowright/screen-recording.mp4}"
shift
if [ "${1:-}" = "--" ]; then shift; fi

mkdir -p "$(dirname "$OUTPUT")"
RAW_VIDEO="${OUTPUT%.mp4}.raw.mp4"

echo "[record-screen] Starting ffmpeg x11grab → $RAW_VIDEO"
ffmpeg -nostdin -loglevel warning \
  -f x11grab -framerate 30 -video_size 1280x720 -i :99.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -y "$RAW_VIDEO" &
FFMPEG_PID=$!

# Give ffmpeg a moment to start capturing
sleep 0.5

echo "[record-screen] Running test: $*"
"$@"
TEST_EXIT=$?

echo "[record-screen] Stopping ffmpeg (PID=$FFMPEG_PID)"
kill -INT "$FFMPEG_PID" 2>/dev/null || true
wait "$FFMPEG_PID" 2>/dev/null || true

if [ ! -f "$RAW_VIDEO" ]; then
  echo "[record-screen] ERROR: ffmpeg did not produce a video"
  exit 1
fi

# If demowright saved a WAV with TTS narration, mux it in
TTS_WAV=$(ls -t /app/.demowright/tmp/demowright-audio-*.wav 2>/dev/null | head -1 || true)
if [ -n "$TTS_WAV" ] && [ -f "$TTS_WAV" ]; then
  echo "[record-screen] Muxing TTS audio: $TTS_WAV → $OUTPUT"
  ffmpeg -nostdin -loglevel warning -y \
    -i "$RAW_VIDEO" -i "$TTS_WAV" \
    -c:v copy -c:a aac -b:a 128k -shortest \
    "$OUTPUT"
  rm -f "$RAW_VIDEO"
else
  echo "[record-screen] No TTS WAV found, using silent video"
  mv "$RAW_VIDEO" "$OUTPUT"
fi

echo "[record-screen] ✓ $OUTPUT"
exit "$TEST_EXIT"
