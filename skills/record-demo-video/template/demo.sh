#!/bin/bash
# Demo: playwright-multi-tab CLI with --extension mode
# Narration-driven timing: each section lasts exactly its TTS audio duration.
set -e
DISPLAY="${DISPLAY:-:99}"

echo "[demo] Waiting for display..."
sleep 1

cat > /tmp/demo-inner.sh << 'INNER'
#!/bin/bash
cd /demo

export DISPLAY="${DISPLAY:-:99}"
export PLAYWRIGHT_MCP_EXECUTABLE_PATH=/usr/local/bin/chromium-demo
export PLAYWRIGHT_MCP_EXTENSION_TOKEN=DEMO_FIXED_TOKEN_FOR_RECORDING
export PWMCP_TEST_CONNECTION_TIMEOUT=30000

# ── Narration / subtitle support ─────────────────────────────────────────────
OUTPUT_DIR="${OUTPUT_DIR:-/output}"
DEMO_START_MS=$(date +%s%3N)

# Load pre-computed durations from generate-narration.py output
[ -f /demo/narration/durations.sh ] && source /demo/narration/durations.sh

__NARRATE_DUR_MS=4000
__NARRATE_START_MS=$DEMO_START_MS

# Log timestamp and set up timing for the current narration segment.
# Actions between narrate() and narrate_end() run concurrently with the audio.
narrate() {
  local name="$1"
  local text="$2"
  local elapsed_ms=$(( $(date +%s%3N) - DEMO_START_MS ))
  local var="DUR_${name//-/_}"
  __NARRATE_DUR_MS="${!var:-4000}"
  echo "${DEMO_START_MS}|${elapsed_ms}|${__NARRATE_DUR_MS}|${text}" >> "${OUTPUT_DIR}/narration_log.txt"
  __NARRATE_START_MS=$(date +%s%3N)
}

# Sleep for the remaining narration duration after actions complete.
narrate_end() {
  local now=$(date +%s%3N)
  local elapsed=$(( now - __NARRATE_START_MS ))
  local remaining=$(( __NARRATE_DUR_MS - elapsed ))
  if [ "$remaining" -gt 50 ]; then
    sleep "$(awk "BEGIN{printf \"%.3f\", ${remaining}/1000}")"
  fi
}

focus_chrome() {
  xdotool search --onlyvisible --class "Chromium" windowfocus --sync 2>/dev/null || true
  xdotool search --onlyvisible --class "Chromium" windowactivate --sync 2>/dev/null || true
  sleep 0.3
}

chrome_tab() {
  focus_chrome
  xdotool key "ctrl+$1"
  sleep 0.5
}

show_cmd() {
  printf '\033[1;32m$\033[0m \033[1;37m%s\033[0m\n' "$*"
  sleep 0.3
}

truncate_output() {
  while IFS= read -r line; do
    if [ ${#line} -gt 76 ]; then
      printf '%s\033[2m…\033[0m\n' "${line:0:75}"
    else
      printf '%s\n' "$line"
    fi
  done
}

cmd() {
  show_cmd "$*"
  eval "$@" | truncate_output
  sleep 0.3
}

section() {
  clear
  printf '\033[1;36m'
  echo '======================================================='
  echo "   $*"
  echo '======================================================='
  printf '\033[0m\n'
  sleep 0.3
}

# ── 01_intro (9.89s) ─────────────────────────────────────────────────────────
clear
printf '\033[1;36m'
echo '======================================================='
echo '   playwright-multi-tab  --  demo'
echo '   github.com/snomiao/playwright-multi-tab'
echo '======================================================='
printf '\033[0m\n'
narrate "01_intro" "playwright-cli-multi-tab lets you control any running Chrome browser from the terminal or an AI agent — no browser relaunch needed, just install the extension."
echo '  1. Install "Playwright MCP Bridge" extension'
echo '  2. Run: playwright-cli-multi-tab open --extension'
echo '  3. CLI connects to YOUR Chrome via extension relay'
echo '  4. Control tabs / sessions from CLI or AI agents'
narrate_end

# ── 02_launch (6.93s) ────────────────────────────────────────────────────────
section 'Step 1: Connect CLI to existing Chrome'
narrate "02_launch" "We launch Chrome with the Playwright MCP Bridge extension pre-loaded, ready to accept the relay connection."
show_cmd '/usr/local/bin/chromium-demo about:blank &'
/usr/local/bin/chromium-demo about:blank >/dev/null 2>&1 &
# Chrome needs ~3s to start; narrate_end covers the remaining wait
narrate_end

# ── 03_connect (8.37s) ───────────────────────────────────────────────────────
narrate "03_connect" "Running open --extension starts a relay server and opens the extension connection page as a new tab inside the running Chrome."
show_cmd 'playwright-cli-multi-tab open --extension'
playwright-cli-multi-tab open --extension &
OPEN_PID=$!
narrate_end

# ── 04_connecting (7.13s) ────────────────────────────────────────────────────
narrate "04_connecting" "The relay waits for the extension's WebSocket handshake. The page auto-connects using the shared relay token."
echo '  Connecting via extension relay...'
echo '  Waiting for extension relay...'
narrate_end

# ── 05_connected (7.09s) ─────────────────────────────────────────────────────
narrate "05_connected" "Connected. The extension now bridges Chrome's debugging protocol directly to our command-line interface."
wait $OPEN_PID
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  printf '\033[1;32m  ✓ Browser connected via extension relay!\033[0m\n'
else
  printf '\033[1;31m  ERROR: Connection failed\033[0m\n'
  exit 1
fi
narrate_end

# ── 06_extensions (8.25s) ────────────────────────────────────────────────────
narrate "06_extensions" "Opening chrome://extensions confirms the Playwright MCP Bridge is installed and enabled in the browser."
focus_chrome
xdotool key ctrl+t
sleep 0.5
xdotool key ctrl+l
sleep 0.2
xdotool type --clearmodifiers --delay 15 "chrome://extensions"
xdotool key Return
sleep 2
focus_chrome
narrate_end

# ── 07_close_ext (5.37s) ─────────────────────────────────────────────────────
narrate "07_close_ext" "Important: this relay tab must stay open — it hosts the WebSocket bridge between Chrome and the CLI. Closing it disconnects the session."
# Switch back to relay tab (tab 0) via CLI — do NOT close any tab
playwright-cli-multi-tab tab-select 0
focus_chrome
narrate_end

# ── 08_step2 (7.05s) ─────────────────────────────────────────────────────────
section 'Step 2: Navigate multiple tabs'
narrate "08_step2" "Step 2: multi-tab navigation from the CLI. Let's open our first new tab."
cmd 'playwright-cli-multi-tab tab-new'
narrate_end

# ── 09_github (7.81s) ────────────────────────────────────────────────────────
narrate "09_github" "Navigating to the playwright-multi-tab GitHub repository. The goto command works on whichever tab is currently active."
cmd 'playwright-cli-multi-tab goto https://github.com/snomiao/playwright-multi-tab'
sleep 2
focus_chrome; chrome_tab 2
narrate_end

# ── 10_playwright (6.01s) ────────────────────────────────────────────────────
clear
narrate "10_playwright" "Opening a second tab for playwright.dev — the official Playwright testing framework documentation."
cmd 'playwright-cli-multi-tab tab-new'
cmd 'playwright-cli-multi-tab goto https://playwright.dev'
sleep 1.5
focus_chrome; chrome_tab 3
narrate_end

# ── 11_wikipedia (4.49s) ─────────────────────────────────────────────────────
clear
narrate "11_wikipedia" "A third tab navigates to the Wikipedia article on Browser Automation."
cmd 'playwright-cli-multi-tab tab-new'
cmd 'playwright-cli-multi-tab goto https://en.wikipedia.org/wiki/Browser_automation'
narrate_end

# ── 12_tablist (9.69s) ───────────────────────────────────────────────────────
clear
narrate "12_tablist" "Tab-list reveals all four open tabs with their index numbers, titles, and live URLs — a clear snapshot of the current browser state."
cmd 'playwright-cli-multi-tab tab-list'
narrate_end

# ── Step 3 ────────────────────────────────────────────────────────────────────

# ── 13_step3 (5.09s) ─────────────────────────────────────────────────────────
section 'Step 3: Switch between tabs'
narrate "13_step3" "Step 3: instant tab switching. Tab-select zero..."
cmd 'playwright-cli-multi-tab tab-select 0'
focus_chrome; chrome_tab 2
narrate_end

# ── 14_snapshot (13.05s) ─────────────────────────────────────────────────────
clear
narrate "14_snapshot" "...brings focus to the Playwright MCP extension page. The snapshot command captures the full accessibility tree — the structured representation AI agents use to read and interact with pages."
cmd 'playwright-cli-multi-tab snapshot'
narrate_end

# ── 15_tab_github (4.29s) ────────────────────────────────────────────────────
clear
narrate "15_tab_github" "Tab-select one — the GitHub repository page comes into focus."
cmd 'playwright-cli-multi-tab tab-select 1'
focus_chrome; chrome_tab 3
narrate_end

# ── Step 4 ────────────────────────────────────────────────────────────────────

# ── 16_step4 (9.93s) ─────────────────────────────────────────────────────────
section 'Step 4: Independent sessions'
narrate "16_step4" "Step 4: independent sessions. The -s flag creates an entirely separate browser session, with its own Chrome window and isolated tab history."
echo '  Session 1 (default) is already connected to the first browser.'
echo '  Now open a second, completely independent browser session.'
narrate_end

# ── 17_session2 (8.81s) ──────────────────────────────────────────────────────
narrate "17_session2" "Opening session two launches a brand-new Chrome window with its own relay connection — completely independent from session one's tabs."
show_cmd 'playwright-cli-multi-tab -s=session2 open --extension'
playwright-cli-multi-tab -s=session2 open --extension &
OPEN2_PID=$!
narrate_end

# ── 18_goto_node (6.89s) ─────────────────────────────────────────────────────
wait $OPEN2_PID || true
printf '\033[1;32m  ✓ Session2 connected!\033[0m\n'
clear
narrate "18_goto_node" "Session two navigates to nodejs.org, in its own isolated browser context."
cmd 'playwright-cli-multi-tab -s=session2 goto https://nodejs.org'
sleep 2
focus_chrome; chrome_tab 2
narrate_end

# ── 19_both (8.81s) ──────────────────────────────────────────────────────────
clear
narrate "19_both" "Both sessions are live simultaneously: session one holds four tabs, session two holds one — each fully independent."
echo '+-- Both sessions running independently ------------------+'
echo ''
cmd 'playwright-cli-multi-tab tab-list'
sleep 0.5
cmd 'playwright-cli-multi-tab -s=session2 tab-list'
narrate_end

# ── 20_done (12.81s) ─────────────────────────────────────────────────────────
section 'Done!'
narrate "20_done" "That's playwright-cli-multi-tab: seamless CLI and AI-agent control of any Chrome browser. Install the extension, run the CLI, and start automating. Find the project link in the description."
printf '\033[1;32m'
echo '  playwright-cli-multi-tab: connect CLI to your Chrome'
echo '  via the "Playwright MCP Bridge" extension.'
echo '  github.com/snomiao/playwright-multi-tab'
printf '\033[0m\n'
narrate_end

playwright-cli-multi-tab close-all > /dev/null 2>&1 || true
playwright-cli-multi-tab -s=session2 close-all > /dev/null 2>&1 || true
INNER
chmod +x /tmp/demo-inner.sh

echo "[demo] Starting xterm with demo script..."
xterm \
  -display "${DISPLAY}" \
  -geometry 80x42+0+0 \
  -bg '#0d1117' -fg '#c9d1d9' \
  -fa 'Monospace' -fs 12 \
  -T 'playwright-cli-multi-tab demo' \
  -e bash /tmp/demo-inner.sh

echo "[demo] xterm finished."
