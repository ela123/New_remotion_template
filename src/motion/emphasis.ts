import type { Align } from "../types";
import { springValue } from "./curve";
import { EASINGS } from "./easing";
import { scaleFrames } from "./stagger";

export const EMPHASIS = {
  popAmount: 0.1,
  popHold30: 6,
  lead30: 2,
  colorFrames30: 4,
  underlineDelay30: 4,
  underlineFrames30: 8,
  glowBoost: 0.9,
  restBump: 0.005,
} as const;

export type EmphasisState = { scale: number; colorMix: number; underline: number; glow: number };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function popBump(t: number, fps: number): number {
  if (t < 0) return 0;
  const hold = scaleFrames(EMPHASIS.popHold30, fps);
  const rise = springValue("pop", t, fps);
  const fall = t >= hold ? springValue("pop", t - hold, fps) : 0;
  const bump = Math.max(-0.3, rise - fall);
  return Math.abs(bump) < EMPHASIS.restBump ? 0 : bump;
}

export function emphasisStart(wordStartFrame: number, fps: number): number {
  return wordStartFrame - scaleFrames(EMPHASIS.lead30, fps);
}

export function emphasisState(t: number, fps: number, pop: boolean): EmphasisState {
  if (t < 0) return { scale: 1, colorMix: 0, underline: 0, glow: 1 };
  const bump = popBump(t, fps);
  const colorMix = EASINGS.outCubic(clamp01(t / Math.max(1, scaleFrames(EMPHASIS.colorFrames30, fps))));
  const u0 = scaleFrames(EMPHASIS.underlineDelay30, fps);
  const underline = EASINGS.outExpo(clamp01((t - u0) / Math.max(1, scaleFrames(EMPHASIS.underlineFrames30, fps))));
  return {
    scale: pop ? 1 + EMPHASIS.popAmount * bump : 1,
    colorMix,
    underline,
    glow: 1 + EMPHASIS.glowBoost * Math.max(0, bump),
  };
}

export function popOriginX(index: number, count: number, align: Align): number {
  const first = index === 0;
  const last = index === count - 1;
  if (align === "left" && first) return 0;
  if (align === "right" && last) return 100;
  if (first && last) return 50;
  if (first) return 100;
  if (last) return 0;
  return 50;
}
