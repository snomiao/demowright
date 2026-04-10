#!/usr/bin/env python3
"""Pre-generate TTS narration audio using Gemini 2.5 Flash TTS.
Run this on the host before building the Docker image.
Reads GOOGLE_GENERATIVE_AI_API_KEY from parent .env.local files.
All segments are generated concurrently.
"""
import os, json, base64, wave, pathlib, requests, time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Read API key from env or .env.local (searches up from script location)
api_key = os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY')
if not api_key:
    script_dir = pathlib.Path(__file__).parent
    for candidate in [script_dir, script_dir.parent, script_dir.parent.parent, script_dir.parent.parent.parent]:
        env_file = candidate / '.env.local'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith('GOOGLE_GENERATIVE_AI_API_KEY='):
                    api_key = line.split('=', 1)[1].strip('"\'')
            break
if not api_key:
    raise RuntimeError("GOOGLE_GENERATIVE_AI_API_KEY not found")

NARRATION_DIR = pathlib.Path(__file__).parent / 'narration'
NARRATION_DIR.mkdir(exist_ok=True)

# ── Narration script ──────────────────────────────────────────────────────────
# Each segment is timed to COVER the corresponding demo action (no silent gaps).
# Segments are sequential; demo actions happen concurrently with their narration.
SEGMENTS = [
    # (filename, text)
    ("01_intro",
     "playwright-cli-multi-tab lets you control any running Chrome browser from "
     "the terminal or an AI agent — no browser relaunch needed, just install the extension."),

    ("02_launch",
     "We launch Chrome with the Playwright MCP Bridge extension pre-loaded, "
     "ready to accept the relay connection."),

    ("03_connect",
     "Running open --extension starts a relay server and opens the extension "
     "connection page as a new tab inside the running Chrome."),

    ("04_connecting",
     "The relay waits for the extension's WebSocket handshake. "
     "The page auto-connects using the shared relay token."),

    ("05_connected",
     "Connected. The extension now bridges Chrome's debugging protocol "
     "directly to our command-line interface."),

    ("06_extensions",
     "Opening chrome://extensions confirms the Playwright MCP Bridge "
     "is installed and enabled in the browser."),

    ("07_close_ext",
     "Important: this relay tab must stay open — it hosts the WebSocket bridge "
     "between Chrome and the CLI. Closing it disconnects the session."),

    ("08_step2",
     "Step 2: multi-tab navigation from the CLI. Let's open our first new tab."),

    ("09_github",
     "Navigating to the playwright-multi-tab GitHub repository. "
     "The goto command works on whichever tab is currently active."),

    ("10_playwright",
     "Opening a second tab for playwright.dev — "
     "the official Playwright testing framework documentation."),

    ("11_wikipedia",
     "A third tab navigates to the Wikipedia article on Browser Automation."),

    ("12_tablist",
     "Tab-list reveals all four open tabs with their index numbers, "
     "titles, and live URLs — a clear snapshot of the current browser state."),

    ("13_step3",
     "Step 3: instant tab switching. Tab-select zero..."),

    ("14_snapshot",
     "...brings focus to the Playwright MCP extension page. "
     "The snapshot command captures the full accessibility tree — "
     "the structured representation AI agents use to read and interact with pages."),

    ("15_tab_github",
     "Tab-select one — the GitHub repository page comes into focus."),

    ("16_step4",
     "Step 4: independent sessions. The -s flag creates an entirely separate "
     "browser session, with its own Chrome window and isolated tab history."),

    ("17_session2",
     "Opening session two launches a brand-new Chrome window with its own "
     "relay connection — completely independent from session one's tabs."),

    ("18_goto_node",
     "Session two navigates to nodejs.org, "
     "in its own isolated browser context."),

    ("19_both",
     "Both sessions are live simultaneously: "
     "session one holds four tabs, session two holds one — "
     "each fully independent."),

    ("20_done",
     "That's playwright-cli-multi-tab: seamless CLI and AI-agent control "
     "of any Chrome browser. Install the extension, run the CLI, and start automating. "
     "Find the project link in the description."),
]

URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={api_key}"
SAMPLE_RATE = 24000

def pcm_to_wav(pcm_bytes, path, rate=24000, channels=1, bits=16):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(channels); w.setsampwidth(bits // 8)
        w.setframerate(rate);     w.writeframes(pcm_bytes)

def wav_duration_ms(path):
    with wave.open(str(path)) as w:
        return int(w.getnframes() / w.getframerate() * 1000)

def generate_one(name, text):
    out_path = NARRATION_DIR / f"{name}.wav"
    if out_path.exists():
        dur = wav_duration_ms(out_path)
        return name, dur, "cached"

    body = {
        "contents": [{"parts": [{"text": text}], "role": "user"}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Kore"}}}
        }
    }
    for attempt in range(3):
        try:
            resp = requests.post(URL, json=body, timeout=30)
            if resp.status_code == 200:
                break
            time.sleep(2 ** attempt)
        except Exception as e:
            time.sleep(2 ** attempt)
    else:
        return name, 4000, "FAILED"

    part = resp.json()['candidates'][0]['content']['parts'][0]
    pcm  = base64.b64decode(part['inlineData']['data'])
    pcm_to_wav(pcm, out_path)
    dur = int(len(pcm) / (SAMPLE_RATE * 2) * 1000)
    return name, dur, "generated"

def generate_silence(duration_ms, path):
    """Generate a silent WAV placeholder (for intentional background video moments)."""
    import struct
    samples = int(SAMPLE_RATE * duration_ms / 1000)
    pcm = struct.pack('<' + 'h' * samples, *([0] * samples))
    pcm_to_wav(pcm, path)

def concatenate_wavs(paths, output_path):
    """Concatenate multiple WAV files into one track (all must be same format)."""
    import wave as wv
    with wv.open(str(output_path), 'wb') as out:
        for i, p in enumerate(paths):
            with wv.open(str(p)) as w:
                if i == 0:
                    out.setparams(w.getparams())
                out.writeframes(w.readframes(w.getnframes()))

print(f"Generating {len(SEGMENTS)} segments concurrently...")
durations = {}
with ThreadPoolExecutor(max_workers=5) as pool:
    futures = {pool.submit(generate_one, name, text): name
               for name, text in SEGMENTS if text is not None}
    for fut in as_completed(futures):
        name, dur_ms, status = fut.result()
        durations[name] = dur_ms
        print(f"  [{status:9s}] {name}: {dur_ms}ms")

# Handle silence placeholders (text=None → "SILENCE_Xs")
for name, text in SEGMENTS:
    if text is None:
        sil_path = NARRATION_DIR / f"{name}.wav"
        if not sil_path.exists():
            # Extract duration from name like "SILENCE_3000ms" or default 3000ms
            import re
            m = re.search(r'(\d+)', name)
            dur_ms = int(m.group(1)) if m else 3000
            generate_silence(dur_ms, sil_path)
            print(f"  [silence  ] {name}: {dur_ms}ms")
        else:
            dur_ms = wav_duration_ms(sil_path)
        durations[name] = dur_ms

# Write durations.sh for demo.sh to source
lines = ['# Auto-generated durations (ms) — source this in demo.sh']
for name, _ in SEGMENTS:
    ms = durations.get(name, 0)
    var = 'DUR_' + name.replace('-', '_')
    lines.append(f'{var}={ms}')
(NARRATION_DIR / 'durations.sh').write_text('\n'.join(lines) + '\n')

# Write meta.json (ordered, for subtitle generation)
meta = [{"name": n, "text": t, "duration_ms": durations.get(n, 0)} for n, t in SEGMENTS]
(NARRATION_DIR / 'meta.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False))

# Concatenate all segments into one continuous narration_track.wav
ordered_wavs = [NARRATION_DIR / f"{name}.wav" for name, _ in SEGMENTS
                if (NARRATION_DIR / f"{name}.wav").exists()]
track_path = NARRATION_DIR / 'narration_track.wav'
concatenate_wavs(ordered_wavs, track_path)
total_s = sum(durations.values()) / 1000
print(f"\nTotal narration: {total_s:.1f}s")
print(f"Concatenated track: {track_path} ({track_path.stat().st_size//1024}KB)")
