import { r as __toCommonJS } from "./chunk-C0p4GxOx.mjs";
import { a as getRenderJob, l as registerHudPage, n as getCurrentSpec, s as init_hud_registry, t as getAudioSegments, u as setGlobalOutputDir } from "./hud-registry-Wfd4b4Nu.mjs";
import { n as video_script_exports, t as init_video_script } from "./video-script.mjs";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
//#region src/hud-overlay.ts
/**
* Returns a script string for addInitScript.
* Sets up event listeners and stores state on window.__qaHud.
* No DOM mutations — safe to run before document.body exists.
*/
function generateListenerScript() {
	return `(${listenerMain.toString()})();`;
}
/**
* Returns a function to call via page.evaluate(fn, opts) after navigation.
* Creates the overlay DOM elements and wires them to the listener state.
*/
function getDomInjector() {
	return domInjector;
}
function listenerMain() {
	if (window.__qaHud) return;
	const modifierKeys = new Set([
		"Shift",
		"Control",
		"Alt",
		"Meta",
		"CapsLock"
	]);
	const state = {
		cx: -40,
		cy: -40,
		onCursorMove: null,
		onMouseDown: null,
		onMouseUp: null,
		onKeyDown: null,
		onKeyUp: null,
		onAnnotate: null
	};
	window.__qaHud = state;
	function formatKey(e) {
		if (modifierKeys.has(e.key)) return e.key;
		const parts = [];
		if (e.ctrlKey) parts.push("Ctrl");
		if (e.altKey) parts.push("Alt");
		if (e.shiftKey) parts.push("Shift");
		if (e.metaKey) parts.push("Meta");
		let key = e.key;
		if (key === " ") key = "Space";
		parts.push(key);
		return parts.join("+");
	}
	document.addEventListener("mousemove", (e) => {
		state.cx = e.clientX;
		state.cy = e.clientY;
		state.onCursorMove?.(e.clientX, e.clientY);
	}, true);
	document.addEventListener("mousedown", (e) => state.onMouseDown?.(e.clientX, e.clientY), true);
	document.addEventListener("mouseup", () => state.onMouseUp?.(), true);
	document.addEventListener("keydown", (e) => state.onKeyDown?.(formatKey(e), modifierKeys.has(e.key)), true);
	document.addEventListener("keyup", (e) => {
		if (modifierKeys.has(e.key)) state.onKeyUp?.(e.key);
	}, true);
}
function domInjector(opts) {
	if (document.querySelector("[data-qa-hud]")) return;
	const state = window.__qaHud;
	if (!state) return;
	const host = document.createElement("div");
	host.setAttribute("data-qa-hud", "");
	host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
	document.body.appendChild(host);
	const cursorSvgs = {
		default: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 2l14 14h-7.5L16 22l-3 1-4.5-6.5L3 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>`,
		dot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="red" stroke="#fff" stroke-width="2"/></svg>`,
		crosshair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="red" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="red" stroke-width="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="red" stroke-width="1.5"/></svg>`
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
	const activeModifiers = /* @__PURE__ */ new Map();
	state.onCursorMove = (x, y) => {
		cursorEl.style.transform = `translate(${x}px, ${y}px)`;
	};
	state.onMouseDown = (x, y) => {
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
	state.onKeyDown = (label, isModifier) => {
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
	state.onKeyUp = (key) => {
		const el = activeModifiers.get(key);
		if (el) {
			el.remove();
			activeModifiers.delete(key);
		}
	};
	state.onAnnotate = (text, durationMs) => {
		const el = document.createElement("div");
		el.className = "qa-subtitle-text";
		el.style.setProperty("--qa-subtitle-ms", durationMs + "ms");
		el.textContent = text;
		subtitleEl.innerHTML = "";
		subtitleEl.appendChild(el);
		el.addEventListener("animationend", () => el.remove());
	};
}
//#endregion
//#region src/audio-capture.ts
/**
* Browser-side audio capture script.
*
* Injected via addInitScript. Monkey-patches AudioContext so that all audio
* routed to ctx.destination gets tapped by a ScriptProcessorNode.
* PCM float32 chunks are sent to Node via page.exposeFunction('__qaHudAudioChunk').
* Part of the demowright video overlay toolkit.
*/
function generateAudioCaptureScript() {
	return `(${audioCaptureMain.toString()})();`;
}
function audioCaptureMain() {
	if (window.__qaHudAudioCapture) return;
	window.__qaHudAudioCapture = true;
	const BUFFER_SIZE = 4096;
	const origConnect = AudioNode.prototype.connect;
	const origDisconnect = AudioNode.prototype.disconnect;
	const interceptors = /* @__PURE__ */ new WeakMap();
	function getInterceptor(ctx, dest) {
		let gain = interceptors.get(dest);
		if (gain) return gain;
		gain = ctx.createGain();
		const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
		processor.onaudioprocess = (e) => {
			const left = e.inputBuffer.getChannelData(0);
			const right = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;
			e.outputBuffer.getChannelData(0).set(left);
			if (e.outputBuffer.numberOfChannels > 1) e.outputBuffer.getChannelData(1).set(right);
			const send = window.__qaHudAudioChunk;
			if (typeof send === "function") {
				const interleaved = new Float32Array(left.length * 2);
				for (let i = 0; i < left.length; i++) {
					interleaved[i * 2] = left[i];
					interleaved[i * 2 + 1] = right[i];
				}
				send(Array.from(interleaved), ctx.sampleRate);
			}
		};
		origConnect.call(gain, processor);
		origConnect.call(processor, dest);
		interceptors.set(dest, gain);
		if (ctx.state === "suspended") ctx.resume?.();
		return gain;
	}
	AudioNode.prototype.connect = function(dest, output, input) {
		if (dest instanceof AudioDestinationNode) {
			const gain = getInterceptor(dest.context, dest);
			return origConnect.call(this, gain, output, input);
		}
		return origConnect.call(this, dest, output, input);
	};
	AudioNode.prototype.disconnect = function(dest) {
		if (dest instanceof AudioDestinationNode) {
			const gain = interceptors.get(dest);
			if (gain) return origDisconnect.call(this, gain);
		}
		return origDisconnect.call(this, dest);
	};
	const mediaElements = /* @__PURE__ */ new WeakSet();
	const origPlay = HTMLMediaElement.prototype.play;
	HTMLMediaElement.prototype.play = function() {
		if (!mediaElements.has(this)) {
			mediaElements.add(this);
			try {
				const ctx = new AudioContext();
				ctx.createMediaElementSource(this).connect(ctx.destination);
				if (ctx.state === "suspended") ctx.resume();
			} catch {}
		}
		return origPlay.call(this);
	};
}
//#endregion
//#region src/audio-writer.ts
/**
* Node-side WAV file writer.
*
* Collects interleaved PCM Float32 chunks from the browser audio capture
* and writes them to a WAV file on close.
*/
var AudioWriter = class {
	chunks = [];
	sampleRate = 44100;
	channels = 2;
	startMs = 0;
	/**
	* Called from the browser via page.exposeFunction.
	* Receives interleaved stereo float32 samples.
	* Each chunk is timestamped with wall-clock time so silence gaps
	* (e.g. during video pause) are preserved in the output.
	*/
	addChunk(samples, sampleRate) {
		const now = Date.now();
		if (this.chunks.length === 0) this.startMs = now;
		this.sampleRate = sampleRate;
		this.chunks.push({
			samples: new Float32Array(samples),
			timestampMs: now
		});
	}
	/** Wall-clock time when first chunk arrived */
	get captureStartMs() {
		return this.startMs;
	}
	/** Sample rate of captured audio */
	get rate() {
		return this.sampleRate;
	}
	/** Total samples collected (interleaved, so / channels for per-channel) */
	get totalSamples() {
		return this.chunks.reduce((sum, c) => sum + c.samples.length, 0);
	}
	/** Total duration including silence gaps (wall-clock based) */
	get duration() {
		if (this.chunks.length === 0) return 0;
		const last = this.chunks[this.chunks.length - 1];
		const lastDurMs = last.samples.length / this.channels / this.sampleRate * 1e3;
		return (last.timestampMs + lastDurMs - this.startMs) / 1e3;
	}
	/**
	* Write collected audio to a WAV file.
	*/
	save(filePath) {
		const float32 = this.toFloat32();
		if (float32.length === 0) return;
		const int16 = new Int16Array(float32.length);
		for (let i = 0; i < float32.length; i++) {
			const s = Math.max(-1, Math.min(1, float32[i]));
			int16[i] = s < 0 ? s * 32768 : s * 32767;
		}
		const dataBytes = int16.length * 2;
		const buffer = Buffer.alloc(44 + dataBytes);
		buffer.write("RIFF", 0);
		buffer.writeUInt32LE(36 + dataBytes, 4);
		buffer.write("WAVE", 8);
		buffer.write("fmt ", 12);
		buffer.writeUInt32LE(16, 16);
		buffer.writeUInt16LE(1, 20);
		buffer.writeUInt16LE(this.channels, 22);
		buffer.writeUInt32LE(this.sampleRate, 24);
		buffer.writeUInt32LE(this.sampleRate * this.channels * 2, 28);
		buffer.writeUInt16LE(this.channels * 2, 32);
		buffer.writeUInt16LE(16, 34);
		buffer.write("data", 36);
		buffer.writeUInt32LE(dataBytes, 40);
		Buffer.from(int16.buffer).copy(buffer, 44);
		writeFileSync(filePath, buffer);
	}
	/**
	* Return all audio as interleaved stereo float32, preserving silence gaps
	* between chunks based on their wall-clock timestamps.
	*/
	toFloat32() {
		if (this.chunks.length === 0) return new Float32Array(0);
		const last = this.chunks[this.chunks.length - 1];
		const lastDurMs = last.samples.length / this.channels / this.sampleRate * 1e3;
		const totalMs = last.timestampMs + lastDurMs - this.startMs;
		const totalSamples = Math.ceil(totalMs / 1e3 * this.sampleRate) * this.channels;
		const out = new Float32Array(totalSamples);
		for (const chunk of this.chunks) {
			const offsetMs = chunk.timestampMs - this.startMs;
			const offsetSamples = Math.floor(offsetMs / 1e3 * this.sampleRate) * this.channels;
			for (let i = 0; i < chunk.samples.length && offsetSamples + i < out.length; i++) out[offsetSamples + i] += chunk.samples[i];
		}
		return out;
	}
	/** Reset for reuse */
	clear() {
		this.chunks = [];
	}
};
//#endregion
//#region src/setup.ts
/**
* Core HUD setup logic — shared by all integration approaches.
*/
init_hud_registry();
const defaultOptions = {
	cursor: true,
	keyboard: true,
	cursorStyle: "default",
	keyFadeMs: 1500,
	actionDelay: 120,
	audio: false,
	tts: false,
	autoAnnotate: false,
	outputDir: ".demowright"
};
/**
* Apply the demowright HUD to an existing BrowserContext.
* Returns an AudioWriter if audio capture is enabled (call .save() after test).
*/
async function applyHud(context, options) {
	const opts = {
		...defaultOptions,
		...options
	};
	setGlobalOutputDir(opts.outputDir);
	const contextStartMs = Date.now();
	await context.addInitScript(generateListenerScript());
	let audioWriter;
	let pulseCapture;
	if (opts.audio) {
		audioWriter = new AudioWriter();
		await context.addInitScript(generateAudioCaptureScript());
		pulseCapture = startPulseCapture(opts.outputDir);
	}
	const hudOpts = {
		cursor: opts.cursor,
		keyboard: opts.keyboard,
		cursorStyle: opts.cursorStyle,
		keyFadeMs: opts.keyFadeMs
	};
	const domInjector = getDomInjector();
	const videoPaths = [];
	const pageNames = [];
	async function setupPage(page) {
		registerHudPage(page, { tts: opts.tts });
		wrapNavigation(page, domInjector, hudOpts, pageNames);
		if (opts.actionDelay > 0) patchPageDelay(page, opts.actionDelay);
		if (audioWriter) {
			await setupAudioCapture(page, audioWriter);
			try {
				const vp = await page.video()?.path();
				if (vp) videoPaths.push(vp);
			} catch {}
		}
	}
	for (const page of context.pages()) await setupPage(page);
	context.on("page", (page) => setupPage(page));
	if (audioWriter && opts.audio) {
		const outDir = join(process.cwd(), opts.outputDir);
		const tmpDir = join(outDir, "tmp");
		mkdirSync(tmpDir, { recursive: true });
		const gitignorePath = join(outDir, ".gitignore");
		if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, "*\n");
		const audioPath = typeof opts.audio === "string" ? opts.audio : join(tmpDir, `demowright-audio-${Date.now()}.wav`);
		const allPages = [...context.pages()];
		context.on("page", (pg) => allPages.push(pg));
		context.on("close", () => {
			const pulseWavPath = pulseCapture?.stop();
			for (const pg of allPages) {
				const job = getRenderJob(pg);
				if (job) {
					finalizeRenderJob(job, videoPaths);
					return;
				}
			}
			const segments = [];
			for (const pg of allPages) segments.push(...getAudioSegments(pg));
			const hasTts = segments.length > 0;
			const hasBrowserAudio = audioWriter.totalSamples > 0;
			const hasPulseAudio = pulseWavPath && existsSync(pulseWavPath);
			if (!hasTts && !hasBrowserAudio && !hasPulseAudio) return;
			let audioOffsetMs = 0;
			if (hasTts || hasPulseAudio) {
				const firstSegMs = hasTts ? segments[0].timestampMs : contextStartMs;
				audioOffsetMs = firstSegMs - contextStartMs;
				buildAndSaveAudioTrack(segments, audioPath, firstSegMs, hasBrowserAudio ? audioWriter : void 0, contextStartMs, hasPulseAudio ? pulseWavPath : void 0);
			} else audioWriter.save(audioPath);
			if (hasPulseAudio) console.log(`[demowright] Pulse audio captured: ${pulseWavPath}`);
			const mp4Path = join(outDir, `${getCurrentSpec() ?? pageNames[0] ?? `demowright-${Date.now()}`}.mp4`);
			const trimSec = (audioOffsetMs / 1e3).toFixed(3);
			let muxed = false;
			for (const videoPath of videoPaths) try {
				if (!existsSync(videoPath)) continue;
				execSync(`ffmpeg -y -ss ${trimSec} -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -shortest "${mp4Path}"`, { stdio: "pipe" });
				muxed = true;
				try {
					unlinkSync(audioPath);
				} catch {}
				console.log(`[demowright] ✓ Rendered: ${mp4Path}`);
			} catch {}
			if (!muxed) {
				console.log(`[demowright] Audio saved: ${audioPath}`);
				console.log(`[demowright] Mux: ffmpeg -y -ss ${trimSec} -i <video.webm> -i "${audioPath}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -shortest "${mp4Path}"`);
			}
		});
	}
	return audioWriter;
}
/**
* Wraps page navigation methods to inject HUD DOM after each navigation.
*/
function wrapNavigation(page, domInjector, hudOpts, pageNames) {
	async function injectDom() {
		try {
			if (page.isClosed()) return;
			await page.evaluate(domInjector, hudOpts);
		} catch {}
	}
	async function captureTitle() {
		if (!pageNames) return;
		try {
			if (page.isClosed()) return;
			let title = await page.title();
			if (!title) title = await page.evaluate(() => {
				return document.querySelector("h1, .brand, [class*='logo'], header h2")?.textContent?.trim() ?? "";
			});
			if (title) {
				const clean = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
				if (clean && !clean.startsWith("loading")) pageNames.push(clean);
			}
		} catch {}
	}
	const originalGoto = page.goto.bind(page);
	page.goto = async function(...args) {
		const result = await originalGoto(...args);
		await injectDom();
		await captureTitle();
		return result;
	};
	const originalReload = page.reload.bind(page);
	page.reload = async function(...args) {
		const result = await originalReload(...args);
		await injectDom();
		return result;
	};
	const originalSetContent = page.setContent.bind(page);
	page.setContent = async function(...args) {
		const result = await originalSetContent(...args);
		await injectDom();
		return result;
	};
	for (const method of ["goBack", "goForward"]) {
		const original = page[method].bind(page);
		page[method] = async function(...args) {
			const result = await original(...args);
			await injectDom();
			return result;
		};
	}
}
function patchPageDelay(page, delay) {
	for (const method of [
		"click",
		"dblclick",
		"fill",
		"press",
		"type",
		"check",
		"uncheck",
		"selectOption",
		"hover",
		"tap",
		"dragAndDrop"
	]) {
		const original = page[method];
		if (typeof original === "function") page[method] = async function(...args) {
			const result = await original.apply(this, args);
			await page.waitForTimeout(delay);
			return result;
		};
	}
	const kb = page.keyboard;
	for (const method of [
		"press",
		"type",
		"insertText"
	]) {
		const original = kb[method];
		if (typeof original === "function") kb[method] = async function(...args) {
			const result = await original.apply(this, args);
			await page.waitForTimeout(delay);
			return result;
		};
	}
}
/**
* Expose the audio chunk receiver on the page so the browser-side
* capture script can send PCM data to Node.
*/
async function setupAudioCapture(page, writer) {
	try {
		await page.exposeFunction("__qaHudAudioChunk", (samples, sampleRate) => {
			writer.addChunk(samples, sampleRate);
		});
	} catch {}
}
/**
* Build a WAV file from stored TTS segments placed at their actual
* wall-clock timestamps. Silence fills gaps between segments.
* This eliminates drift caused by page.evaluate overhead.
*/
function buildAndSaveAudioTrack(segments, outputPath, contextStartMs, browserAudio, contextCreationMs, pulseWavPath) {
	if (segments.length === 0 && !browserAudio && !pulseWavPath) return;
	const firstBuf = segments[0]?.wavBuf;
	const dataOffset0 = firstBuf ? firstBuf.indexOf("data") + 8 : -1;
	if (segments.length > 0 && dataOffset0 < 8) return;
	const sampleRate = firstBuf ? firstBuf.readUInt32LE(24) : browserAudio?.rate ?? 44100;
	const channels = 2;
	const baseMs = contextStartMs;
	let totalMs = 0;
	for (const seg of segments) {
		const dOff = seg.wavBuf.indexOf("data") + 8;
		if (dOff < 8) continue;
		const sr = seg.wavBuf.readUInt32LE(24);
		const ch = seg.wavBuf.readUInt16LE(22);
		const segDur = seg.wavBuf.subarray(dOff).length / 2 / ch / sr * 1e3;
		const endMs = seg.timestampMs - baseMs + segDur;
		if (endMs > totalMs) totalMs = endMs;
	}
	if (browserAudio && browserAudio.totalSamples > 0) {
		const browserStartMs = browserAudio.captureStartMs;
		const browserDurMs = browserAudio.duration * 1e3;
		const browserEndMs = browserStartMs - baseMs + browserDurMs;
		if (browserEndMs > totalMs) totalMs = browserEndMs;
	}
	if (pulseWavPath && existsSync(pulseWavPath)) try {
		const pBuf = readFileSync(pulseWavPath);
		const pDoff = pBuf.indexOf("data");
		if (pDoff >= 0) {
			const pSr = pBuf.readUInt32LE(24);
			const pCh = pBuf.readUInt16LE(22);
			const pDurMs = pBuf.readUInt32LE(pDoff + 4) / 2 / pCh / pSr * 1e3;
			if (pDurMs > totalMs) totalMs = pDurMs;
		}
	} catch {}
	const totalSamples = Math.ceil(totalMs / 1e3 * sampleRate * channels);
	const trackBuffer = new Float32Array(totalSamples);
	for (const seg of segments) {
		const dOff = seg.wavBuf.indexOf("data") + 8;
		if (dOff < 8) continue;
		const ch = seg.wavBuf.readUInt16LE(22);
		const pcmData = seg.wavBuf.subarray(dOff);
		const sampleCount = pcmData.length / 2;
		const float32 = new Float32Array(sampleCount);
		for (let i = 0; i < sampleCount; i++) float32[i] = pcmData.readInt16LE(i * 2) / 32768;
		const stereo = ch === 1 ? (() => {
			const s = new Float32Array(sampleCount * 2);
			for (let i = 0; i < sampleCount; i++) {
				s[i * 2] = float32[i];
				s[i * 2 + 1] = float32[i];
			}
			return s;
		})() : float32;
		const offsetMs = seg.timestampMs - baseMs;
		const offsetSamples = Math.floor(offsetMs / 1e3 * sampleRate) * channels;
		for (let i = 0; i < stereo.length && offsetSamples + i < trackBuffer.length; i++) trackBuffer[offsetSamples + i] += stereo[i];
	}
	if (browserAudio && browserAudio.totalSamples > 0) {
		const browserPcm = browserAudio.toFloat32();
		const browserOffsetMs = browserAudio.captureStartMs - baseMs;
		const browserOffsetSamples = Math.max(0, Math.floor(browserOffsetMs / 1e3 * sampleRate) * channels);
		if (browserAudio.rate === sampleRate) for (let i = 0; i < browserPcm.length && browserOffsetSamples + i < trackBuffer.length; i++) trackBuffer[browserOffsetSamples + i] += browserPcm[i];
		else {
			const ratio = browserAudio.rate / sampleRate;
			const outLen = Math.floor(browserPcm.length / ratio);
			for (let i = 0; i < outLen && browserOffsetSamples + i < trackBuffer.length; i++) {
				const srcIdx = i * ratio;
				const lo = Math.floor(srcIdx);
				const hi = Math.min(lo + 1, browserPcm.length - 1);
				const frac = srcIdx - lo;
				trackBuffer[browserOffsetSamples + i] += browserPcm[lo] * (1 - frac) + browserPcm[hi] * frac;
			}
		}
	}
	if (pulseWavPath && existsSync(pulseWavPath)) try {
		const pulseBuf = readFileSync(pulseWavPath);
		const pDoff = pulseBuf.indexOf("data");
		if (pDoff >= 0) {
			const pSr = pulseBuf.readUInt32LE(24);
			const pCh = pulseBuf.readUInt16LE(22);
			const pBps = pulseBuf.readUInt16LE(34);
			const pcmData = pulseBuf.subarray(pDoff + 8);
			const bytesPerSample = pBps / 8;
			const sampleCount = Math.floor(pcmData.length / bytesPerSample);
			const float32 = new Float32Array(sampleCount);
			for (let i = 0; i < sampleCount; i++) if (pBps === 16) float32[i] = pcmData.readInt16LE(i * 2) / 32768;
			else if (pBps === 32) float32[i] = pcmData.readFloatLE(i * 4);
			const stereo = pCh === 1 ? (() => {
				const s = new Float32Array(sampleCount * 2);
				for (let i = 0; i < sampleCount; i++) {
					s[i * 2] = float32[i];
					s[i * 2 + 1] = float32[i];
				}
				return s;
			})() : float32;
			if (pSr === sampleRate) for (let i = 0; i < stereo.length && i < trackBuffer.length; i++) trackBuffer[i] += stereo[i];
			else {
				const ratio = pSr / sampleRate;
				const outLen = Math.min(Math.floor(stereo.length / ratio), trackBuffer.length);
				for (let i = 0; i < outLen; i++) {
					const srcIdx = i * ratio;
					const lo = Math.floor(srcIdx);
					const hi = Math.min(lo + 1, stereo.length - 1);
					const frac = srcIdx - lo;
					trackBuffer[i] += stereo[lo] * (1 - frac) + stereo[hi] * frac;
				}
			}
		}
	} catch {}
	const int16 = new Int16Array(trackBuffer.length);
	for (let i = 0; i < trackBuffer.length; i++) {
		const s = Math.max(-1, Math.min(1, trackBuffer[i]));
		int16[i] = s < 0 ? s * 32768 : s * 32767;
	}
	const dataBytes = int16.length * 2;
	const buffer = Buffer.alloc(44 + dataBytes);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataBytes, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(channels, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * channels * 2, 28);
	buffer.writeUInt16LE(channels * 2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataBytes, 40);
	Buffer.from(int16.buffer).copy(buffer, 44);
	writeFileSync(outputPath, buffer);
}
/**
* Finalize a video render job: run ffmpeg with the actual video path,
* applying fade transitions, subtitle burn-in, and chapter metadata.
*/
function finalizeRenderJob(job, videoPaths) {
	for (const videoPath of videoPaths) try {
		if (!existsSync(videoPath)) continue;
		// Compute trim: video starts at page creation, audio at script.render().
		// Probe video duration, subtract audio duration (job.totalMs) to find the gap.
		let trimSec = 0;
		try {
			const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
			const videoDur = parseFloat(probeOut) || 0;
			const audioDur = job.totalMs / 1e3;
			if (videoDur > 0 && audioDur > 0 && videoDur > audioDur + 0.5) {
				trimSec = videoDur - audioDur;
			}
		} catch {}
		const ssArg = trimSec > 0.5 ? `-ss ${trimSec.toFixed(3)}` : "";
		const filters = [];
		const transitions = job.timeline.filter((e) => e.kind === "transition");
		for (const t of transitions) {
			const startSec = (t.startMs / 1e3).toFixed(3);
			const durSec = (t.durationMs / 1e3).toFixed(3);
			const endSec = ((t.startMs + t.durationMs) / 1e3).toFixed(3);
			filters.push(`fade=t=out:st=${startSec}:d=${durSec}`);
			filters.push(`fade=t=in:st=${endSec}:d=${durSec}`);
		}
		if (existsSync(job.srtPath)) {
			const escapedSrt = job.srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/'/g, "'\\''");
			filters.push(`subtitles='${escapedSrt}'`);
		}
		const vf = filters.length > 0 ? `-vf "${filters.join(",")}"` : "";
		const chapterArgs = existsSync(job.chaptersPath) ? `-i "${job.chaptersPath}" -map_metadata 2` : "";
		execSync([
			`ffmpeg -y`,
			ssArg,
			`-i "${videoPath}"`,
			`-i "${job.wavPath}"`,
			chapterArgs,
			vf,
			`-c:v libx264 -preset fast -crf 28`,
			`-c:a aac`,
			`-shortest`,
			`"${job.mp4Path}"`
		].filter(Boolean).join(" "), { stdio: "pipe" });
		for (const f of [
			job.wavPath,
			job.srtPath,
			job.chaptersPath
		]) try {
			unlinkSync(f);
		} catch {}
		console.log(`[demowright] ✓ Rendered: ${job.mp4Path}`);
		return;
	} catch (e) {
		console.log(`[demowright] ffmpeg failed: ${e.message}`);
	}
	if (videoPaths.length > 0) {
		const { buildFfmpegCommand } = (init_video_script(), __toCommonJS(video_script_exports));
		if (typeof buildFfmpegCommand === "function") {
			const cmd = buildFfmpegCommand(videoPaths[0] ?? "<video.webm>", job.wavPath, job.srtPath, job.chaptersPath, job.mp4Path, job.timeline);
			console.log(`[demowright] Run manually:\n${cmd}`);
		}
	}
}
function startPulseCapture(outputDir) {
	const g = globalThis;
	if (g.__qaHudPulseCapture) return g.__qaHudPulseCapture;
	const preCreatedPipe = process.env.__DEMOWRIGHT_PULSE_PIPE;
	if (!preCreatedPipe) return startPulseCaptureDirectly(outputDir);
	const tmpDir = join(process.cwd(), outputDir, "tmp");
	mkdirSync(tmpDir, { recursive: true });
	const wavPath = join(tmpDir, `pulse-capture-${Date.now()}.wav`);
	const pipePath = preCreatedPipe;
	const MAX_BYTES = 44100 * 2 * 2 * 300;
	let ringBuffer = Buffer.alloc(0);
	let totalBytesReceived = 0;
	let readerProc;
	try {
		readerProc = spawn("cat", [pipePath], { stdio: [
			"ignore",
			"pipe",
			"ignore"
		] });
		readerProc.stdout.on("data", (chunk) => {
			totalBytesReceived += chunk.length;
			ringBuffer = Buffer.concat([ringBuffer, chunk]);
			if (ringBuffer.length > MAX_BYTES) {
				const excess = ringBuffer.length - MAX_BYTES;
				const alignedExcess = excess - excess % 4;
				ringBuffer = ringBuffer.subarray(alignedExcess);
			}
		});
		console.log(`[demowright] Pulse pipe-sink capture started: pipe=${pipePath}, PID=${readerProc.pid}`);
	} catch (e) {
		console.log(`[demowright] Pulse pipe reader failed: ${e.message}`);
		return;
	}
	const handle = { stop() {
		g.__qaHudPulseCapture = void 0;
		try {
			readerProc?.kill("SIGTERM");
		} catch {}
		try {
			const modules = execSync("pactl list modules short", { encoding: "utf-8" });
			for (const line of modules.split("\n")) if (line.includes("demowright_sink")) {
				const modId = line.split("	")[0];
				try {
					execSync(`pactl unload-module ${modId}`, { stdio: "pipe" });
				} catch {}
			}
		} catch {}
		const raw = ringBuffer;
		const durSec = raw.length / 44100 / 4;
		console.log(`[demowright] Pulse audio: ${(totalBytesReceived / 1024 / 1024).toFixed(1)}MB received, ${raw.length} bytes kept, ${durSec.toFixed(1)}s`);
		try {
			unlinkSync(pipePath);
		} catch {}
		if (raw.length === 0) return void 0;
		const maxWavData = 4294967259;
		const pcmData = raw.length > maxWavData ? raw.subarray(raw.length - maxWavData) : raw;
		const hdr = Buffer.alloc(44);
		hdr.write("RIFF", 0);
		hdr.writeUInt32LE(36 + pcmData.length, 4);
		hdr.write("WAVE", 8);
		hdr.write("fmt ", 12);
		hdr.writeUInt32LE(16, 16);
		hdr.writeUInt16LE(1, 20);
		hdr.writeUInt16LE(2, 22);
		hdr.writeUInt32LE(44100, 24);
		hdr.writeUInt32LE(44100 * 2 * 2, 28);
		hdr.writeUInt16LE(4, 32);
		hdr.writeUInt16LE(16, 34);
		hdr.write("data", 36);
		hdr.writeUInt32LE(pcmData.length, 40);
		writeFileSync(wavPath, Buffer.concat([hdr, pcmData]));
		return wavPath;
	} };
	g.__qaHudPulseCapture = handle;
	return handle;
}
/**
* Fallback: create pipe-sink directly (for programmatic applyHud without config.ts).
*/
function startPulseCaptureDirectly(outputDir) {
	try {
		execSync("pactl info", { stdio: "pipe" });
	} catch {
		return;
	}
	const tmpDir = join(process.cwd(), outputDir, "tmp");
	mkdirSync(tmpDir, { recursive: true });
	const pipePath = join(tmpDir, `pulse-pipe-${Date.now()}.raw`);
	try {
		const modules = execSync("pactl list modules short", { encoding: "utf-8" });
		for (const line of modules.split("\n")) if (line.includes("demowright_sink")) {
			const modId = line.split("	")[0];
			try {
				execSync(`pactl unload-module ${modId}`, { stdio: "pipe" });
			} catch {}
		}
	} catch {}
	try {
		execSync(`pactl load-module module-pipe-sink sink_name=demowright_sink file="${pipePath}" rate=44100 channels=2 format=s16le sink_properties=device.description="Demowright_Audio_Capture"`, {
			stdio: "pipe",
			encoding: "utf-8"
		}).trim();
		execSync("pactl set-default-sink demowright_sink", { stdio: "pipe" });
	} catch {
		return;
	}
	process.env.__DEMOWRIGHT_PULSE_PIPE = pipePath;
	return startPulseCapture(outputDir);
}
//#endregion
export { defaultOptions as n, AudioWriter as r, applyHud as t };
