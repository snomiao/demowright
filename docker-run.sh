#!/usr/bin/env bash
# Build and run demowright examples inside Docker with audio capture.
# Usage:
#   ./docker-run.sh                          # run all examples
#   ./docker-run.sh examples/07-video-player.spec.ts   # run one example
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="demowright"
OUTPUT_DIR=".demowright"

docker build -t "$IMAGE" .

# Pass GEMINI_API_KEY if set (for TTS narration)
ENV_ARGS=(-e "DEMOWRIGHT_DOCKER=1")
if [ -n "${GEMINI_API_KEY:-}" ]; then
  ENV_ARGS+=(-e "GEMINI_API_KEY=$GEMINI_API_KEY")
fi

# If .env.local exists, pass it through
if [ -f .env.local ]; then
  ENV_ARGS+=(--env-file .env.local)
fi

# Detect if we should use ffmpeg screen recording (needed for example 08
# which uses the system file picker — Playwright video can't capture system UI)
USE_SCREEN_RECORD=0
for arg in "$@"; do
  case "$arg" in
    *08-file-upload-download*) USE_SCREEN_RECORD=1 ;;
  esac
done

# Build the test command
if [ $# -gt 0 ]; then
  if [ "$USE_SCREEN_RECORD" = "1" ]; then
    # Wrap with screen-capture script that runs ffmpeg x11grab around the test
    TEST_CMD=(/app/docker-record-screen.sh /app/.demowright/08-file-upload-download.mp4 -- bunx playwright test --config examples/playwright.config.ts "$@")
  else
    TEST_CMD=(bunx playwright test --config examples/playwright.config.ts "$@")
  fi
else
  TEST_CMD=(bunx playwright test --config examples/playwright.config.ts)
fi

mkdir -p "$OUTPUT_DIR"

# GPU pass-through for hardware-accelerated video decoding (optional).
# Requires: nvidia-container-toolkit (Linux) or Docker Desktop GPU sharing.
# Falls back gracefully to software rendering if GPU is unavailable.
GPU_ARGS=()
if docker info 2>/dev/null | grep -q "Runtimes:.*nvidia"; then
  GPU_ARGS+=(--gpus all)
fi

docker run --rm \
  "${GPU_ARGS[@]+"${GPU_ARGS[@]}"}" \
  "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}" \
  -v "$(pwd)/$OUTPUT_DIR:/app/$OUTPUT_DIR" \
  "$IMAGE" \
  "${TEST_CMD[@]}"

echo ""
echo "Output videos in $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/*.mp4 2>/dev/null || echo "(no .mp4 files found)"
