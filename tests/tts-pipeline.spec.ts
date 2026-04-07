/**
 * End-to-end test: TTS narration → audio capture → WAV → STT validation.
 *
 * 1. applyHud with Gemini TTS + audio capture
 * 2. narrate() a known phrase
 * 3. Close context → WAV saved
 * 4. Send WAV to Gemini STT → verify transcription matches
 */
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import http from "node:http";
import { test, expect } from "@playwright/test";
import { applyHud } from "../src/setup.js";
import { narrate, hudWait } from "../src/helpers.js";

const AUDIO_PATH = "tmp/tts-pipeline-test.wav";
const PHRASE = "Hello, this is a test of the QA HUD narration system.";

async function geminiTts(text: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}`);
  const json = (await res.json()) as any;
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("No audio in Gemini response");
  const pcm = Buffer.from(b64, "base64");
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4);
  hdr.write("WAVE", 8); hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(24000, 24);
  hdr.writeUInt32LE(48000, 28); hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34); hdr.write("data", 36);
  hdr.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([hdr, pcm]);
}

async function geminiStt(wavPath: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const b64 = readFileSync(wavPath).toString("base64");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Transcribe this audio exactly. Return only the transcription text, nothing else." },
            { inlineData: { mimeType: "audio/wav", data: b64 } },
          ],
        }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini STT ${res.status}`);
  const json = (await res.json()) as any;
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

const HTML = `<!DOCTYPE html><html><body><h1>TTS Pipeline Test</h1></body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
  try { unlinkSync(AUDIO_PATH); } catch {}
});
test.afterAll(() => server?.close());

test("TTS → audio capture → WAV → STT validates narration", async ({ browser }) => {
  test.skip(!process.env.GEMINI_API_KEY, "GEMINI_API_KEY required");

  // 1. Create context with HUD + audio capture + Gemini TTS
  const context = await browser.newContext();
  await applyHud(context, { audio: AUDIO_PATH, tts: geminiTts, actionDelay: 100 });

  const page = await context.newPage();
  await page.goto(baseUrl);
  await hudWait(page, 500);

  // 2. Narrate a known phrase
  await narrate(page, PHRASE);
  await hudWait(page, 500);

  // 3. Close context → triggers WAV save
  await context.close();

  // 4. Verify WAV file exists with meaningful content
  expect(existsSync(AUDIO_PATH)).toBe(true);
  const wavSize = readFileSync(AUDIO_PATH).length;
  expect(wavSize).toBeGreaterThan(1000);

  // 5. Send WAV to Gemini STT for transcription
  const transcription = await geminiStt(AUDIO_PATH);
  console.log("Transcription:", transcription);

  // 6. Verify key words from the narrated phrase appear in transcription
  const t = transcription.toLowerCase();
  expect(t).toContain("hello");
  expect(t).toContain("test");
  expect(t).toContain("narration");
});
