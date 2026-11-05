import { noise2D } from "@remotion/noise";

const AMPLITUDE = 0.003;
const CYCLES_PER_SECOND = 0.25;

export function driftScale(seed: string, frame: number, fps: number, enabled: boolean): number {
  if (!enabled) return 1;
  const n = noise2D(seed, (frame / fps) * CYCLES_PER_SECOND, 0);
  return 1 + Math.min(Math.max(n, -1), 1) * AMPLITUDE;
}
