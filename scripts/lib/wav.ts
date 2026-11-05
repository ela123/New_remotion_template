export type PadOptions = { durationSec: number; sampleRate?: number; fadeInSec?: number; fadeOutSec?: number };

const CHORD_HZ = [110, 164.81, 220, 277.18, 329.63] as const;
const DETUNE = [-0.0015, 0.0015] as const;
const PEAK = 0.5;

function envelope(t: number, duration: number, fadeIn: number, fadeOut: number): number {
  const attack = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
  const release = fadeOut > 0 ? Math.min(1, Math.max(0, (duration - t) / fadeOut)) : 1;
  return attack * release;
}

function padSample(t: number, channel: number): number {
  let sum = 0;
  CHORD_HZ.forEach((hz, i) => {
    const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * (0.07 + 0.013 * i) * t + i + channel * 0.8);
    for (const detune of DETUNE) {
      const f = hz * (1 + detune * (channel === 0 ? 1 : -1));
      const phase = 2 * Math.PI * f * t;
      sum += swell * (Math.sin(phase) + 0.18 * Math.sin(2 * phase));
    }
  });
  return sum;
}

export function synthPad(opts: PadOptions): Float32Array[] {
  const sampleRate = opts.sampleRate ?? 48000;
  const length = Math.max(1, Math.round(opts.durationSec * sampleRate));
  const fadeIn = opts.fadeInSec ?? 0.6;
  const fadeOut = opts.fadeOutSec ?? 0.8;
  const channels = [new Float32Array(length), new Float32Array(length)];
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = envelope(t, opts.durationSec, fadeIn, fadeOut);
    channels.forEach((data, c) => {
      const v = padSample(t, c) * env;
      data[i] = v;
      peak = Math.max(peak, Math.abs(v));
    });
  }
  const gain = peak > 0 ? PEAK / peak : 0;
  for (const data of channels) for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) * gain;
  return channels;
}

export function encodeWav(channels: Float32Array[], sampleRate: number): Buffer {
  const channelCount = channels.length;
  const length = channels[0]?.length ?? 0;
  const dataSize = length * channelCount * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channelCount, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buf.writeUInt16LE(channelCount * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const data of channels) {
      const v = Math.max(-1, Math.min(1, data[i] ?? 0));
      buf.writeInt16LE(Math.round(v * 32767), offset);
      offset += 2;
    }
  }
  return buf;
}
