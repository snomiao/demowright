/**
 * Offline TTS stub for tests: returns a mono 24 kHz WAV containing a quiet
 * tone whose length scales with the text. Never played on the host — the
 * audio track is assembled Node-side and only inspected via headers/ffprobe.
 */
export function toneWav(durationMs: number, sampleRate = 24000): Buffer {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 3000), 44 + i * 2);
  }
  return buf;
}

/** ~60 ms per character, minimum 500 ms. */
export async function fakeTts(text: string): Promise<Buffer> {
  return toneWav(Math.max(500, text.length * 60));
}

/** Parse a PCM WAV header. */
export function wavInfo(buf: Buffer) {
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const dataOffset = buf.indexOf("data") + 8;
  const dataBytes = buf.length - dataOffset;
  return { sampleRate, channels, durationMs: (dataBytes / 2 / channels / sampleRate) * 1000 };
}
