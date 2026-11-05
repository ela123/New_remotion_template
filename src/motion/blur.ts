export type Vec = { x: number; y: number };
export type BlurOptions = { k: number; maxBlurPx: number; thresholdPxPerFrame: number };

export const DEFAULT_BLUR: BlurOptions = { k: 0.16, maxBlurPx: 14, thresholdPxPerFrame: 0.5 };

function axisBlur(delta: number, opts: BlurOptions): number {
  const speed = Math.abs(delta);
  if (speed < opts.thresholdPxPerFrame) return 0;
  return Math.min(Math.max(speed * opts.k, 0), opts.maxBlurPx);
}

export function directionalBlur(prev: Vec, cur: Vec, opts: BlurOptions = DEFAULT_BLUR): Vec {
  return { x: axisBlur(cur.x - prev.x, opts), y: axisBlur(cur.y - prev.y, opts) };
}
