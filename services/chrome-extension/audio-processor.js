/*
  MeetMind Chrome Extension - audio-processor.js

  WHAT AudioWorkletProcessor IS:
  - AudioWorkletProcessor runs on the browser's real-time audio rendering thread,
    not the main UI thread.
  - This gives lower latency and more stable timing for streaming audio.
  - It is generally better than ScriptProcessorNode, which is legacy and runs
    callbacks on the main thread where UI work can cause audio glitches.

  FLOAT32 -> INT16 CONVERSION:
  - Web Audio inputs are Float32 samples in roughly the range [-1.0, 1.0].
  - Many speech backends (including AssemblyAI PCM pipelines) expect 16-bit
    signed PCM integers.
  - We scale each sample by 32767 and clamp into int16 range so the stream is
    compatible with PCM16 ingestion.

  WHY TRANSFER THE BUFFER:
  - postMessage with a transfer list moves ownership of ArrayBuffer to the main
    thread instead of cloning the full payload.
  - This avoids extra memory copies for every audio frame and reduces GC/CPU
    overhead, which is important for real-time streaming.
*/

class MeetMindAudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const float32 = input[0];
    if (!float32 || float32.length === 0) {
      return true;
    }

    const int16Array = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i += 1) {
      int16Array[i] = Math.max(
        -32768,
        Math.min(32767, float32[i] * 32767)
      );
    }

    this.port.postMessage(
      { type: 'audio_chunk', buffer: int16Array },
      [int16Array.buffer]
    );

    return true;
  }
}

registerProcessor('meetmind-audio-processor', MeetMindAudioProcessor);
