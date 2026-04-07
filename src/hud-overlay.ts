/**
 * Client-side HUD overlay scripts.
 *
 * Split into two parts for maximum compatibility:
 * 1. Listener script — registered via addInitScript (no DOM mutation, runs early)
 * 2. DOM injection script — executed via page.evaluate after navigation
 */

export type HudOptions = {
  cursor: boolean;
  keyboard: boolean;
  cursorStyle: "default" | "dot" | "crosshair";
  keyFadeMs: number;
};

/**
 * Returns a script string for addInitScript.
 * Sets up event listeners and stores state on window.__qaHud.
 * No DOM mutations — safe to run before document.body exists.
 */
export function generateListenerScript(): string {
  return `(${listenerMain.toString()})();`;
}

/**
 * Returns a function to call via page.evaluate(fn, opts) after navigation.
 * Creates the overlay DOM elements and wires them to the listener state.
 */
export function getDomInjector() {
  return domInjector;
}

// --- Listener (no DOM, safe in addInitScript) ---
function listenerMain() {
  if ((window as any).__qaHud) return;

  const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

  const state = {
    cx: -40,
    cy: -40,
    onCursorMove: null as ((x: number, y: number) => void) | null,
    onMouseDown: null as ((x: number, y: number) => void) | null,
    onMouseUp: null as (() => void) | null,
    onKeyDown: null as ((label: string, isModifier: boolean) => void) | null,
    onKeyUp: null as ((key: string) => void) | null,
    onAnnotate: null as ((text: string, durationMs: number) => void) | null,
  };
  (window as any).__qaHud = state;

  function formatKey(e: KeyboardEvent): string {
    if (modifierKeys.has(e.key)) return e.key;
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    let key = e.key;
    if (key === " ") key = "Space";
    parts.push(key);
    return parts.join("+");
  }

  document.addEventListener(
    "mousemove",
    (e) => {
      state.cx = e.clientX;
      state.cy = e.clientY;
      state.onCursorMove?.(e.clientX, e.clientY);
    },
    true,
  );
  document.addEventListener("mousedown", (e) => state.onMouseDown?.(e.clientX, e.clientY), true);
  document.addEventListener("mouseup", () => state.onMouseUp?.(), true);
  document.addEventListener(
    "keydown",
    (e) => state.onKeyDown?.(formatKey(e), modifierKeys.has(e.key)),
    true,
  );
  document.addEventListener(
    "keyup",
    (e) => {
      if (modifierKeys.has(e.key)) state.onKeyUp?.(e.key);
    },
    true,
  );
}

// --- DOM injector (called via page.evaluate after navigation) ---
function domInjector(opts: HudOptions) {
  if (document.querySelector("[data-qa-hud]")) return;
  const state = (window as any).__qaHud;
  if (!state) return;

  const host = document.createElement("div");
  host.setAttribute("data-qa-hud", "");
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(host);

  const cursorSvgs: Record<string, string> = {
    default: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 2l14 14h-7.5L16 22l-3 1-4.5-6.5L3 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>`,
    dot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="red" stroke="#fff" stroke-width="2"/></svg>`,
    crosshair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="red" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="red" stroke-width="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="red" stroke-width="1.5"/></svg>`,
  };

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    [data-qa-hud] * { pointer-events: none !important; }
    .qa-cursor {
      position: fixed; top: 0; left: 0;
      width: 20px; height: 20px;
      pointer-events: none; z-index: 2147483647;
      transition: transform 0.02s linear;
      will-change: transform;
      display: ${opts.cursor ? "block" : "none"};
    }
    .qa-cursor svg { width: 20px; height: 20px; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.5)); }
    .qa-cursor.clicking svg { transform: scale(0.85); }
    .qa-ripple {
      position: fixed; width: 20px; height: 20px;
      border-radius: 50%; border: 2px solid rgba(255, 60, 60, 0.8);
      pointer-events: none;
      animation: qa-ripple-anim 0.5s ease-out forwards;
      z-index: 2147483646;
    }
    @keyframes qa-ripple-anim {
      0%   { transform: translate(-50%,-50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%,-50%) scale(3);   opacity: 0; }
    }
    .qa-keys {
      position: fixed; bottom: 20px; left: 50%;
      transform: translateX(-50%);
      display: ${opts.keyboard ? "flex" : "none"};
      gap: 6px; flex-wrap: wrap; justify-content: center;
      max-width: 80vw; pointer-events: none; z-index: 2147483647;
    }
    .qa-key {
      background: rgba(0,0,0,0.75); color: #fff;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 14px; line-height: 1;
      padding: 5px 10px; border-radius: 5px;
      border: 1px solid rgba(255,255,255,0.3);
      white-space: nowrap;
      animation: qa-key-fade ${opts.keyFadeMs}ms ease-out forwards;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .qa-key.modifier {
      background: rgba(60, 120, 255, 0.8);
      animation: none;
    }
    @keyframes qa-key-fade {
      0%   { opacity: 1; transform: translateY(0); }
      70%  { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-10px); }
    }
    .qa-subtitle {
      position: fixed; bottom: 60px; left: 50%;
      transform: translateX(-50%);
      max-width: 80vw; text-align: center;
      pointer-events: none; z-index: 2147483647;
    }
    .qa-subtitle-text {
      display: inline-block;
      background: rgba(0,0,0,0.8); color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 18px; line-height: 1.4;
      padding: 8px 18px; border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      animation: qa-subtitle-fade var(--qa-subtitle-ms, 3000ms) ease-out forwards;
    }
    @keyframes qa-subtitle-fade {
      0%   { opacity: 1; }
      80%  { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  host.appendChild(styleEl);

  const cursorEl = document.createElement("div");
  cursorEl.className = "qa-cursor";
  cursorEl.innerHTML = cursorSvgs[opts.cursorStyle] || cursorSvgs.default;
  cursorEl.style.transform = `translate(${state.cx}px, ${state.cy}px)`;
  host.appendChild(cursorEl);

  const keysEl = document.createElement("div");
  keysEl.className = "qa-keys";
  host.appendChild(keysEl);

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "qa-subtitle";
  host.appendChild(subtitleEl);

  const activeModifiers = new Map<string, HTMLElement>();

  state.onCursorMove = (x: number, y: number) => {
    cursorEl.style.transform = `translate(${x}px, ${y}px)`;
  };
  state.onMouseDown = (x: number, y: number) => {
    cursorEl.classList.add("clicking");
    const ripple = document.createElement("div");
    ripple.className = "qa-ripple";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    host.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };
  state.onMouseUp = () => {
    cursorEl.classList.remove("clicking");
  };
  state.onKeyDown = (label: string, isModifier: boolean) => {
    if (isModifier) {
      if (!activeModifiers.has(label)) {
        const el = document.createElement("div");
        el.className = "qa-key modifier";
        el.textContent = label;
        keysEl.prepend(el);
        activeModifiers.set(label, el);
      }
      return;
    }
    const el = document.createElement("div");
    el.className = "qa-key";
    el.textContent = label;
    keysEl.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  };
  state.onKeyUp = (key: string) => {
    const el = activeModifiers.get(key);
    if (el) {
      el.remove();
      activeModifiers.delete(key);
    }
  };
  state.onAnnotate = (text: string, durationMs: number) => {
    const el = document.createElement("div");
    el.className = "qa-subtitle-text";
    el.style.setProperty("--qa-subtitle-ms", durationMs + "ms");
    el.textContent = text;
    subtitleEl.innerHTML = "";
    subtitleEl.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  };
}
