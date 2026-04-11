#!/usr/bin/env bash
set -euo pipefail

# Start dbus (PulseAudio needs it for module loading)
mkdir -p /run/dbus
dbus-daemon --system --nofork &>/dev/null &

# Start Xvfb on display :99
Xvfb :99 -screen 0 1280x720x24 -ac 2>/dev/null &
export DISPLAY=:99

# Wait for Xvfb to be ready
for i in $(seq 1 20); do
  if [ -e /tmp/.X11-unix/X99 ]; then break; fi
  sleep 0.1
done

# PulseAudio: set runtime dir so clients (Firefox) can discover the socket
export XDG_RUNTIME_DIR=/tmp/pulse-runtime
mkdir -p "$XDG_RUNTIME_DIR"

# Start PulseAudio daemon
pulseaudio --start --exit-idle-time=-1 --disable-shm=true 2>/dev/null

# Wait for PulseAudio to be ready and export its socket for all processes
for i in $(seq 1 30); do
  if pactl info >/dev/null 2>&1; then break; fi
  sleep 0.1
done

# Tell all child processes (Firefox, Playwright workers) where PulseAudio lives
PULSE_SOCKET=$(pactl info 2>/dev/null | grep "Server String:" | awk '{print $3}')
export PULSE_SERVER="unix:${PULSE_SOCKET}"

# Start fluxbox window manager (needed for system dialogs like file picker
# to render and accept focus). Suppress its noisy "Failed to read" warnings.
fluxbox 2>/dev/null &
sleep 0.3

# Set a branded desktop background AFTER fluxbox starts (fluxbox overrides
# the X root window with its own default). Generate a dark wallpaper with
# demowright branding so the first frames of screen recordings look clean.
convert -size 1280x720 xc:"#0f172a" \
  -font "DejaVu-Sans" -pointsize 42 -fill "#1e293b" \
  -gravity center -annotate +0-40 "demowright" \
  -pointsize 16 -fill "#334155" \
  -annotate +0+20 "Playwright Video Production" \
  /tmp/demowright-bg.png 2>/dev/null
fbsetbg -f /tmp/demowright-bg.png 2>/dev/null || xsetroot -solid "#0f172a" 2>/dev/null || true

echo "[demowright-docker] Xvfb :99 ready, fluxbox ready, PulseAudio ready (PULSE_SERVER=$PULSE_SERVER)"

# Run the command passed to the container
exec "$@"
