#!/bin/bash
# Container entrypoint: Xvfb + fluxbox + ffmpeg screen recording + demo
# Audio is post-mixed (2-pass): video recorded silently, narration_track.wav overlaid after.
set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
SCREEN_W=1280
SCREEN_H=800
OUTPUT_DIR="${OUTPUT_DIR:-/output}"

mkdir -p "$OUTPUT_DIR"

echo "[record.sh] Starting Xvfb on display ${DISPLAY} (${SCREEN_W}x${SCREEN_H})..."
Xvfb "${DISPLAY}" -screen 0 "${SCREEN_W}x${SCREEN_H}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 1

export DISPLAY

echo "[record.sh] Starting fluxbox..."
fluxbox -display "${DISPLAY}" 2>/dev/null &
FLUXBOX_PID=$!
sleep 0.5
DISPLAY="${DISPLAY}" xdotool search --onlyvisible --name "xmessage" key Return 2>/dev/null || true
sleep 0.5

# Clear previous logs
rm -f "${OUTPUT_DIR}/narration_log.txt"

# Record ffmpeg start time (ms since epoch)
FFMPEG_START_MS=$(date +%s%3N)
echo "$FFMPEG_START_MS" > "${OUTPUT_DIR}/ffmpeg_start_ms.txt"

echo "[record.sh] Starting ffmpeg (${SCREEN_W}x${SCREEN_H} @ 30fps, video only) -> ${OUTPUT_DIR}/screen-recording.mp4"
ffmpeg -y \
    -f x11grab \
    -video_size "${SCREEN_W}x${SCREEN_H}" \
    -framerate 30 \
    -i "${DISPLAY}.0" \
    -c:v libx264 \
    -preset ultrafast \
    -pix_fmt yuv420p \
    "${OUTPUT_DIR}/screen-recording.mp4" \
    2>"${OUTPUT_DIR}/ffmpeg.log" &
FFMPEG_PID=$!
sleep 1

echo "[record.sh] Running demo..."
/demo/demo.sh 2>&1 | tee "${OUTPUT_DIR}/demo.log"

echo "[record.sh] Demo finished. Stopping ffmpeg..."
kill $FFMPEG_PID 2>/dev/null || true
wait $FFMPEG_PID 2>/dev/null || true

# ── Post-process: mix narration_track.wav + burn subtitles ───────────────────
NARRATION_TRACK="/demo/narration/narration_track.wav"
META_JSON="/demo/narration/meta.json"

if [ -f "${OUTPUT_DIR}/narration_log.txt" ] && [ -s "${OUTPUT_DIR}/narration_log.txt" ] && [ -f "$NARRATION_TRACK" ]; then
    echo "[record.sh] Post-processing: mixing narration + generating subtitles..."

    VIDEO_DUR_MS=$(python3 -c "
import subprocess, json
r = subprocess.run(['ffprobe','-v','quiet','-print_format','json','-show_format','${OUTPUT_DIR}/screen-recording.mp4'], capture_output=True, text=True)
print(int(float(json.loads(r.stdout)['format']['duration'])*1000))
")

    python3 - <<PYEOF
import pathlib, subprocess, json

ffmpeg_start = int('${FFMPEG_START_MS}')
video_dur_ms = int('${VIDEO_DUR_MS}')
out_dir = pathlib.Path('${OUTPUT_DIR}')
narration_track = pathlib.Path('${NARRATION_TRACK}')
meta_json = pathlib.Path('${META_JSON}')

# Get demo_start_ms from first line of narration_log.txt
log_lines = out_dir.joinpath('narration_log.txt').read_text().strip().splitlines()
demo_start_ms = int(log_lines[0].split('|')[0]) if log_lines else ffmpeg_start

# Audio delay: how far into the video the narration track starts
audio_delay_ms = max(0, demo_start_ms - ffmpeg_start)
print(f'ffmpeg_start={ffmpeg_start}ms, demo_start={demo_start_ms}ms, audio_delay={audio_delay_ms}ms')

def ms_to_srt(ms):
    ms = max(0, ms)
    h = ms // 3600000; ms %= 3600000
    m = ms // 60000;   ms %= 60000
    s = ms // 1000;    ms %= 1000
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

# Generate subtitles from meta.json cumulative durations + audio_delay
meta = json.loads(meta_json.read_text())
srt_lines = []
cursor_ms = audio_delay_ms
for i, seg in enumerate(meta, 1):
    dur = seg['duration_ms']
    if dur <= 0 or not seg.get('text'):
        cursor_ms += dur
        continue
    start_ms = cursor_ms
    end_ms   = cursor_ms + dur
    srt_lines += [str(i), f"{ms_to_srt(start_ms)} --> {ms_to_srt(end_ms)}", seg['text'], '']
    cursor_ms = end_ms

(out_dir / 'subtitles.srt').write_text('\n'.join(srt_lines))
print(f"Written subtitles.srt ({len([l for l in srt_lines if l.isdigit() or (l and l[0].isdigit())])} entries)")

# Extend video if narration outlasts video
track_end_ms = cursor_ms
pad_ms = max(0, track_end_ms - video_dur_ms + 500)
print(f'track_end={track_end_ms}ms, video={video_dur_ms}ms, pad={pad_ms}ms')

# Step 1: overlay single narration_track.wav at audio_delay_ms
d = audio_delay_ms
cmd = ['ffmpeg', '-y',
    '-i', str(out_dir / 'screen-recording.mp4'),
    '-i', str(narration_track),
    '-filter_complex',
        f'[1:a]adelay={d}|{d}[aout]',
    '-map', '0:v',
    *((['-vf', f'tpad=stop_duration={pad_ms}ms:color=black'] if pad_ms > 0 else [])),
    '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    str(out_dir / 'screen-recording-audio.mp4')
]
print('Mixing audio...')
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print('ffmpeg error:', r.stderr[-800:])
else:
    print('Audio mixed OK')

    # Step 2: burn subtitles
    import shutil
    shutil.copy(str(out_dir / 'subtitles.srt'), '/tmp/demo_subs.srt')
    cmd2 = ['ffmpeg', '-y',
        '-i', str(out_dir / 'screen-recording-audio.mp4'),
        '-vf', "subtitles=/tmp/demo_subs.srt:force_style='FontName=Noto Sans,FontSize=16,PrimaryColour=&H00ffffff,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2'",
        '-c:a', 'copy',
        str(out_dir / 'screen-recording-final.mp4')
    ]
    r2 = subprocess.run(cmd2, capture_output=True, text=True)
    if r2.returncode != 0:
        print('subtitle ffmpeg error:', r2.stderr[-800:])
    else:
        print('Final video written: screen-recording-final.mp4')
PYEOF
else
    echo "[record.sh] Narration log or track not found, skipping mix."
fi

kill $FLUXBOX_PID 2>/dev/null || true
kill $XVFB_PID 2>/dev/null || true

echo "[record.sh] Output files:"
ls -lh "${OUTPUT_DIR}/"
