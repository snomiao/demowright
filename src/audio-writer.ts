/**
 * Node-side WAV file writer.
 *
 * Collects interleaved PCM Float32 chunks from the browser audio capture
 * and writes them to a WAV file on close.
 */
import { writeFileSync } from "node:fs";

export class AudioWriter {
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private channels = 2;

  /**
   * Called from the browser via page.exposeFunction.
   * Receives interleaved stereo float32 samples.
   */
  addChunk(samples: number[], sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.chunks.push(new Float32Array(samples));
  }

  /** Total samples collected (interleaved, so / channels for per-channel) */
  get totalSamples(): number {
    return this.chunks.reduce((sum, c) => sum + c.length, 0);
  }

  get duration(): number {
    return this.totalSamples / this.channels / this.sampleRate;
  }

  /**
   * Write collected audio to a WAV file.
   */
  save(filePath: string): void {
    const totalSamples = this.totalSamples;
    if (totalSamples === 0) return;

    // Convert float32 to int16
    const int16 = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
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

  /** Reset for reuse */
  clear(): void {
    this.chunks = [];
  }
}
