import { parseRate, type VideoInfo } from "./probe";

export type StandardRate = { label: string; ffmpegRate: string; fps: number };

const STANDARD_RATES: readonly StandardRate[] = [
  { label: "23.976", ffmpegRate: "24000/1001", fps: 24000 / 1001 },
  { label: "24", ffmpegRate: "24", fps: 24 },
  { label: "25", ffmpegRate: "25", fps: 25 },
  { label: "29.97", ffmpegRate: "30000/1001", fps: 30000 / 1001 },
  { label: "30", ffmpegRate: "30", fps: 30 },
  { label: "50", ffmpegRate: "50", fps: 50 },
  { label: "59.94", ffmpegRate: "60000/1001", fps: 60000 / 1001 },
  { label: "60", ffmpegRate: "60", fps: 60 },
];

const MIN_VFR_TOLERANCE = 0.002;

export function nearestStandardRate(fps: number): StandardRate {
  let best = STANDARD_RATES[4] ?? { label: "30", ffmpegRate: "30", fps: 30 };
  for (const rate of STANDARD_RATES) {
    if (Math.abs(rate.fps - fps) < Math.abs(best.fps - fps)) best = rate;
  }
  return best;
}

function relativeDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(a, b);
}

export function isVariableFrameRate(info: VideoInfo): boolean {
  const r = parseRate(info.rFrameRate);
  const avg = parseRate(info.avgFrameRate);
  if (r <= 0 || avg <= 0) return false;
  const tolerance = Math.max(MIN_VFR_TOLERANCE, info.frameCount > 0 ? 1.5 / info.frameCount : 0);
  return relativeDiff(r, avg) > tolerance;
}
