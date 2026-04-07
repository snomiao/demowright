/**
 * Browser-side audio capture script.
 *
 * Injected via addInitScript. Monkey-patches AudioContext so that all audio
 * routed to ctx.destination gets tapped by a ScriptProcessorNode.
 * PCM float32 chunks are sent to Node via page.exposeFunction('__qaHudAudioChunk').
 * Part of the demowright video overlay toolkit.
 */

export function generateAudioCaptureScript(): string {
  return `(${audioCaptureMain.toString()})();`;
}

function audioCaptureMain() {
  if ((window as any).__qaHudAudioCapture) return;
  (window as any).__qaHudAudioCapture = true;

  const BUFFER_SIZE = 4096;

  // Immediately patch AudioNode.prototype.connect BEFORE any AudioContext is created.
  // We'll intercept connections to any AudioDestinationNode and insert our tap.
  const origConnect = AudioNode.prototype.connect as Function;
  const origDisconnect = AudioNode.prototype.disconnect as Function;

  // Map each AudioDestinationNode to its interceptor GainNode
  const interceptors = new WeakMap<AudioDestinationNode, GainNode>();

  function getInterceptor(ctx: BaseAudioContext, dest: AudioDestinationNode): GainNode {
    let gain = interceptors.get(dest);
    if (gain) return gain;

    // Create tap: source → gain → processor → destination
    gain = ctx.createGain();
    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;

      // Pass through audio
      e.outputBuffer.getChannelData(0).set(left);
      if (e.outputBuffer.numberOfChannels > 1) {
        e.outputBuffer.getChannelData(1).set(right);
      }

      // Send to Node
      const send = (window as any).__qaHudAudioChunk;
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
    return gain;
  }

  // Patch connect — redirect destination connections through our tap
  (AudioNode.prototype as any).connect = function (
    this: AudioNode,
    dest: any,
    output?: number,
    input?: number,
  ) {
    if (dest instanceof AudioDestinationNode) {
      const gain = getInterceptor(dest.context, dest);
      return origConnect.call(this, gain, output, input);
    }
    return origConnect.call(this, dest, output, input);
  };

  (AudioNode.prototype as any).disconnect = function (this: AudioNode, dest?: any) {
    if (dest instanceof AudioDestinationNode) {
      const gain = interceptors.get(dest);
      if (gain) return origDisconnect.call(this, gain);
    }
    return origDisconnect.call(this, dest);
  };

  // Also capture HTMLMediaElement audio by routing through Web Audio
  const mediaElements = new WeakSet<HTMLMediaElement>();
  const origPlay = HTMLMediaElement.prototype.play;

  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!mediaElements.has(this)) {
      mediaElements.add(this);
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(this);
        source.connect(ctx.destination); // will be intercepted by our patch
      } catch {
        // CORS or already connected — ignore
      }
    }
    return origPlay.call(this);
  };
}
