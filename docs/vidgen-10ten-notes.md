# Video Generation Notes: 10ten Japanese Reader Auto-Speak Demo

Field notes from building an automated demo video for the [10ten-ja-reader auto-speak PR](https://github.com/birchill/10ten-ja-reader/pull/2869). The final video is at https://youtu.be/zWHSj193f2w (unlisted).

## Architecture

```
Host (macOS)                         Docker (Debian arm64)
─────────────                        ─────────────────────
prepare.sh                           record.sh
  ├─ patch source (autoSpeak=true,     ├─ Xvfb :99 (1280×800)
  │   enabled=true by default)         ├─ PulseAudio (null sink)
  ├─ pnpm build:chrome                 ├─ dbus + speech-dispatcher
  ├─ cp dist-chrome → demo-video/      ├─ pre-warmed Chromium profile
  └─ python3 generate-narration.py     │   (IndexedDB with 10ten dict)
       ├─ Gemini TTS (en narration)    ├─ Chromium --load-extension
       ├─ Gemini TTS (ja samples)      │   --start-maximized (full UI)
       └─ narration_track.wav          ├─ python3 -m http.server :8000
                                       ├─ ffmpeg x11grab + pulse capture
docker build → 10ten-demo image        ├─ demo.sh (xdotool cursor moves)
docker run → output/                   │   └─ writes scenes.log markers
                                       └─ post-mix (Python inside record.sh):
                                            ├─ scene-based video clipping
                                            ├─ narration + JP audio mix
                                            │   with volume ducking
                                            └─ subtitle burn-in
```

## Pipeline: 2.5-pass recording

### Pass 0: TTS narration generation (host-side)

`generate-narration.py` calls Gemini 2.5 Flash TTS concurrently for:
- **8 English narration segments** (~48s total) — describes the demo flow
- **4 Japanese sample clips** (~0.5-1.3s each) — the words the extension "speaks"

Key learnings:
- Gemini TTS returns raw PCM (`audio/L16;codec=pcm;rate=24000`), must add WAV header with Python `wave` module
- **Single-word Japanese inputs get rejected** (`finishReason: "OTHER"`). Workaround: wrap in a carrier phrase where the target word comes FIRST ("カーソルです。"), then ffmpeg-trim to just the word portion
- Concurrent generation via ThreadPoolExecutor (5 workers) — all 12 segments in ~10s
- Outputs are cached (idempotent re-runs skip existing .wav files)

### Pass 1: Screen recording (container)

demo.sh runs at **natural pace** (no narration-driven timing). It:
1. Uses pre-launched Chromium (started by record.sh before ffmpeg)
2. Moves cursor via `xdotool mousemove --sync` to absolute screen coordinates
3. Writes scene markers to `scenes.log` (`elapsed_ms|scene_name`)
4. Each scene is just "do the action, sleep a bit, move on"

### Pass 2: Narration-driven clipping + audio mix (container post-process)

Python inside record.sh reads `scenes.log` + narration `meta.json`:
1. For each narration segment, find matching scene marker timestamps
2. **Clip** the recorded video to that time range
3. **Trim** if natural action > narration duration; **pad with last-frame clone** (`tpad=stop_mode=clone`) if shorter
4. **Concat** all clips via ffmpeg concat demuxer
5. **Audio mix**: English narration + Japanese samples with per-frame volume ducking
6. **Subtitle burn-in** from meta.json

## Hard-won lessons

### Google Chrome vs Chromium

**Chrome stable (137+) silently rejects `--load-extension`** for unpacked extensions. The chrome.log warning:
```
--disable-extensions-except is not allowed in Google Chrome, ignoring.
```
No error for `--load-extension` itself — it just silently does nothing. CDP `/json/list` shows the page tab but no service_worker, confirming the extension never loaded.

**Chromium (Debian apt)** fully supports `--load-extension` and is functionally identical on Linux for our use case. Chrome's TTS advantage (native voices) only exists on macOS/Windows; on Linux both use speech-dispatcher → espeak-ng.

### Extension needs dictionary download time

10ten downloads ~10 MB of jpdict data from `data.10ten.life` on first launch (kanji, words, names, radicals — ~40 jsonl files). Without the dictionary, **the popup shows empty** and no hover events produce results.

Solution: **warm up the profile during Docker build**:
```dockerfile
RUN Xvfb :88 ... & \
    DISPLAY=:88 chromium --load-extension=/ext/10ten \
      --user-data-dir=/preloaded-profile about:blank & \
    sleep 180 && kill ... 
```
Then at runtime, copy `preloaded-profile` to `/tmp/chrome-profile` (stripping Singleton lock files from the build sandbox).

### Profile lock files

The build-time Chromium leaves `SingletonLock`, `SingletonSocket`, `SingletonCookie` in the profile. Runtime Chromium refuses to start:
```
The profile appears to be in use by another Chromium process (8) on another computer (buildkitsandbox).
```
Fix: `find /tmp/chrome-profile -name 'Singleton*' -delete` before launching.

### 10ten default-disabled state

10ten extensions starts in **disabled** state per-tab. The toolbar icon must be clicked to enable. In headless recording this is impractical.

Solution: patch the source before building:
```python
# In all-tab-manager.ts, replace #getStoredEnabledState()
async #getStoredEnabledState(): Promise<boolean> {
    return true; /* demo-build patch */
}
```
Similarly patch `autoSpeak` default from `false` to `true`:
```typescript
// In config.ts
return this.#settings.autoSpeak !== false;  // was: !!this.#settings.autoSpeak
```
Both patches are applied by `prepare.sh` and reverted after `pnpm build:chrome`.

### Linux headless has no Japanese TTS

Chromium on Linux uses speech-dispatcher → espeak-ng. Even with:
- dbus-daemon (system + session)
- PulseAudio with null-sink
- speech-dispatcher configured for espeak-ng + ja
- `--autoplay-policy=no-user-gesture-required`

...the speech-dispatcher module fails: `"Opening sound device failed. Cannot open plugin server."` The captured PulseAudio monitor is -91 dB (silence).

**Resolution**: generate Japanese audio via Gemini TTS in post-production and mix it into the video at the hover timestamps. Documented honestly in the YouTube description.

### `--kiosk` mode hides ALL browser UI

We initially used `--kiosk` to get a borderless window at 0,0. But:
1. No tabs, address bar, or extension toolbar visible → doesn't look like "real Chrome"
2. Extension loading behavior may differ

Switched to `--start-maximized` with no `--kiosk` or `--app`. Chrome renders full UI (tabs, URL bar, extension area). The visible chrome UI is ~85px tall, reducing the content area to ~715px. Hover coordinates must account for this offset.

### `--app=URL` silently disables content scripts

In some Chrome/Chromium versions, `--app=URL` opens the page in an app-mode window where extension content scripts **don't inject**. CDP shows the page tab but no extension context. The extension service_worker may load but content_scripts don't match.

This cost hours of debugging. Symptom: popups never appear despite the service worker being active.

### xdotool coordinates require no window manager

With fluxbox running, the WM adds a 19px title bar. Window at "position 0,0" actually has content at y=19. Hard-coded hover coordinates miss their targets.

Removing fluxbox entirely (no WM) gives the window at true 0,0 with geometry exactly matching the `--window-size` flag.

### `tpad` vs `-t` output duration conflict

When using ffmpeg's tpad filter to extend a short clip with frozen frames:
```
ffmpeg -ss 5 -i recording.mp4 -t 1.5 -vf 'tpad=stop_mode=clone:stop_duration=10' out.mp4
```
The `-t 1.5` limits the **output** to 1.5s, defeating tpad's extension. Fix: use **input-side** seeking with `-ss`/`-to` BEFORE `-i`:
```
ffmpeg -ss 5 -to 6.5 -i recording.mp4 -vf 'tpad=stop_mode=clone:stop_duration=10' out.mp4
```

### Audio ducking with per-frame volume expression

To prevent English narration from drowning out the Japanese TTS clips, use a piecewise volume function that hard-ducks during known JP windows:
```python
cond = '+'.join(f'between(t,{s:.3f},{e:.3f})' for s, e in duck_windows)
vol_expr = f"'if(gt({cond},0),0.05,0.9)'"
# Apply: [1:a]volume={vol_expr}:eval=frame[narr]
```
Sidechain compression (`sidechaincompress`) was tried first but didn't duck aggressively enough for short clips.

### JP audio timing: account for popup render delay

10ten shows the popup ~400-500ms after cursor arrives (debounce + dictionary lookup). If the Japanese TTS clip plays at cursor-arrival time, the audio leads the visual by ~0.5s.

Fix: offset JP clips by 600-700ms from scene start so they land just after the popup renders.

### File:// URLs block extension content scripts

Chrome/Chromium blocks extension content scripts on `file://` pages by default. The "Allow access to file URLs" toggle requires manual user interaction.

Fix: serve the demo page via `python3 -m http.server 8000` inside the container and open `http://localhost:8000/demo-page.html`.

### Gemini model IDs for verification

- `gemini-2.5-pro` — reliable, balanced reviewer. Called our final video "perfectly usable as a PR demo"
- `gemini-3-pro-preview` — very harsh, flags 1-2s desync as "severe". Useful for catching real issues but over-reports
- `gemini-3.1-pro` — does NOT exist as a public API model (returns 404)

### Verification via Gemini Files API

Upload the video via resumable upload, wait for `state: ACTIVE`, then send a multimodal prompt asking concrete questions about what's visible/audible. Two-reviewer approach (2.5-pro + 3-pro-preview) catches both false positives and real issues.

## File inventory

```
demo-video/
├── Dockerfile           # Chromium + Xvfb + PulseAudio + 10ten extension
├── prepare.sh           # Host: patch source, build, generate TTS
├── generate-narration.py # Gemini TTS for narration + JP samples
├── generate-thumbnail.py # (optional) Gemini image gen
├── demo-page.html       # Japanese sample page with absolute-positioned targets
├── demo.sh              # xdotool cursor movements + scene markers
├── record.sh            # Container entrypoint: Xvfb + ffmpeg + post-mix
├── dist-chrome/         # Built extension (gitignored)
├── narration/           # Generated .wav files (gitignored)
└── output/              # Final video + intermediates (gitignored)
```

## Reproduction

```bash
cd demo-video
./prepare.sh                    # patches, builds, generates TTS (~3 min)
docker buildx build --load -t 10ten-demo .  # ~4 min (includes 180s warmup)
docker run --rm -v "$(pwd)/output:/output" 10ten-demo  # ~2 min
open output/screen-recording-final.mp4
```

Requires: Docker, pnpm, Python 3 with `requests`, and a `GEMINI_API_KEY` in `.env.local`.
