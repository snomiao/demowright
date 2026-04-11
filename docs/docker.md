# Docker — Audio & System UI Capture

Playwright's built-in video recorder has two limitations Docker solves:

1. **No page audio** — Playwright records pixels, not sound. Docker provides
   PulseAudio as a virtual audio sink.
2. **No system UI** — OS dialogs (file picker, print) are rendered outside the
   browser DOM. Docker provides ffmpeg x11grab for full-screen capture.

## Architecture

```
┌─ Docker Container ───────────────────────────────────────────┐
│  dbus            → PulseAudio module loading                 │
│  Xvfb :99        → virtual display (1280×720)                │
│  fluxbox         → window manager (system dialogs need it)   │
│  PulseAudio      → virtual audio sink (module-pipe-sink)     │
│                                                              │
│  Firefox (headed) → renders to :99, audio to PulseAudio      │
│  Playwright       → controls Firefox                         │
│  demowright       → cursor overlay, TTS, audio capture       │
│                                                              │
│  Recording:                                                  │
│    Mode A: Playwright video (DOM only) + PulseAudio WAV      │
│    Mode B: ffmpeg x11grab (full screen incl. system dialogs) │
│                                                              │
│  Post: ffmpeg mux video + TTS WAV + page audio → MP4         │
└──────────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Set by | Purpose |
|----------|--------|---------|
| `DISPLAY=:99` | entrypoint | Xvfb display for headed browser |
| `XDG_RUNTIME_DIR` | entrypoint | PulseAudio socket discovery |
| `PULSE_SERVER` | entrypoint | Explicit PulseAudio socket path |
| `DEMOWRIGHT_DOCKER=1` | docker-run.sh | Enables system-picker mode in example 08 |

## PulseAudio Audio Capture

When `audio: true` is set:

1. `withDemowright()` (config.ts, main process) creates `module-pipe-sink` named `demowright_sink`
2. Sets it as default sink → Firefox routes audio there
3. Workers read raw PCM from the FIFO pipe via `startPulseCapture()`
4. On context close: PCM → WAV → mixed with TTS → ffmpeg mux

Two capture layers:
- **Web Audio API intercept** — monkey-patches `AudioNode.prototype.connect`, captures via ScriptProcessorNode. Works without Docker.
- **PulseAudio pipe-sink** — system-level capture of ALL browser audio. Docker only.

**Important**: `AudioContext` created by Playwright clicks stays `suspended`. Always call `await ctx.resume()`.

## System UI Capture (xdotool + x11grab)

For OS dialogs invisible to Playwright video:

1. **ffmpeg x11grab** records the entire :99 display
2. **xdotool** clicks at X11 level (bypasses Playwright's filechooser intercept)
3. **xdotool** drives the dialog (Ctrl+L → path → Enter for GTK file chooser)

```ts
// Absolute screen coordinates via Firefox's mozInnerScreenX/Y
const pos = await page.evaluate(() => ({
  x: (window as any).mozInnerScreenX + rect.x + rect.width / 2,
  y: (window as any).mozInnerScreenY + rect.y + rect.height / 2,
}));
execSync(`xdotool mousemove ${pos.x} ${pos.y} click 1`);

// Wait for dialog (xdotool search --name is unreliable — iterate instead)
for (const winId of allWindows) {
  const name = execSync(`xdotool getwindowname ${winId}`);
  if (name.includes("File Upload")) { /* found */ }
}

// Drive GTK file chooser
execSync(`xdotool windowactivate --sync ${dialogId}`);
execSync("xdotool key ctrl+l");
execSync(`xdotool type --delay 30 "${filePath}"`);
execSync("xdotool key Return");
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Pulse audio: 0.0MB received` | Check `PULSE_SERVER` and `XDG_RUNTIME_DIR` are exported |
| `Denied access to client` | Use `--start` mode, ensure `XDG_RUNTIME_DIR` set |
| `AudioContext.state === "suspended"` | `await ctx.resume()` after creating AudioContext |
| Audio leaks during pause | Fixed: AudioWriter uses timestamped chunks |
| Dialog opens but `waitForWindow` times out | Use `getwindowname` not `search --name` |
| Dialog doesn't open | Use `xdotool click` (not `page.click()`) |
| Click misses button | Use `mozInnerScreenX/Y` (not `window.screenY`) |
| Local test overwrites Docker video | `test.skip(!process.env.DEMOWRIGHT_DOCKER)` |
