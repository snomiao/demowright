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

echo "[demowright-docker] Xvfb :99 ready, PulseAudio ready (PULSE_SERVER=$PULSE_SERVER)"

# Run the command passed to the container
exec "$@"
