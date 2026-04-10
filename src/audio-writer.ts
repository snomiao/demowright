/**
 * Node-side WAV file writer.
 *
 * Collects interleaved PCM Float32 chunks from the browser audio capture
 * and writes them to a WAV file on close.
 */
import { writeFileSync } from "node:fs";

interface TimestampedChunk {
  samples: Float32Array;
  timestampMs: number;
}

export class AudioWriter {
  private chunks: TimestampedChunk[] = [];
  private sampleRate = 44100;
  private channels = 2;
  private startMs = 0;

  /**
   * Called from the browser via page.exposeFunction.
   * Receives interleaved stereo float32 samples.
   * Each chunk is timestamped with wall-clock time so silence gaps
   * (e.g. during video pause) are preserved in the output.
   */
  addChunk(samples: number[], sampleRate: number): void {
    const now = Date.now();
    if (this.chunks.length === 0) this.startMs = now;
    this.sampleRate = sampleRate;
    this.chunks.push({ samples: new Float32Array(samples), timestampMs: now });
  }

  /** Wall-clock time when first chunk arrived */
  get captureStartMs(): number {
    return this.startMs;
  }

  /** Sample rate of captured audio */
  get rate(): number {
    return this.sampleRate;
  }

  /** Total samples collected (interleaved, so / channels for per-channel) */
  get totalSamples(): number {
    return this.chunks.reduce((sum, c) => sum + c.samples.length, 0);
  }

  /** Total duration including silence gaps (wall-clock based) */
  get duration(): number {
    if (this.chunks.length === 0) return 0;
    const last = this.chunks[this.chunks.length - 1];
    const lastDurMs = (last.samples.length / this.channels / this.sampleRate) * 1000;
    return (last.timestampMs + lastDurMs - this.startMs) / 1000;
  }

  /**
   * Write collected audio to a WAV file.
   */
  save(filePath: string): void {
    const float32 = this.toFloat32();
    if (float32.length === 0) return;

    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const dataBytes = int16.length * 2;
    const buffer = Buffer.alloc(44 + dataBytes);

    // WAV header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(this.channels, 22);
    buffer.writeUInt32LE(this.sampleRate, 24);
    buffer.writeUInt32LE(this.sampleRate * this.channels * 2, 28); // byte rate
    buffer.writeUInt16LE(this.channels * 2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataBytes, 40);

    // Copy PCM data
    Buffer.from(int16.buffer).copy(buffer, 44);

    writeFileSync(filePath, buffer);
  }

  /**
   * Return all audio as interleaved stereo float32, preserving silence gaps
   * between chunks based on their wall-clock timestamps.
   */
  toFloat32(): Float32Array {
    if (this.chunks.length === 0) return new Float32Array(0);

    // Calculate total duration from first chunk to end of last chunk
    const last = this.chunks[this.chunks.length - 1];
    const lastDurMs = (last.samples.length / this.channels / this.sampleRate) * 1000;
    const totalMs = last.timestampMs + lastDurMs - this.startMs;
    const totalSamples = Math.ceil((totalMs / 1000) * this.sampleRate) * this.channels;

    const out = new Float32Array(totalSamples); // zero-filled = silence

    for (const chunk of this.chunks) {
      const offsetMs = chunk.timestampMs - this.startMs;
      const offsetSamples = Math.floor((offsetMs / 1000) * this.sampleRate) * this.channels;
      for (let i = 0; i < chunk.samples.length && offsetSamples + i < out.length; i++) {
        out[offsetSamples + i] += chunk.samples[i];
      }
    }

    return out;
  }

  /** Reset for reuse */
  clear(): void {
    this.chunks = [];
  }
}
