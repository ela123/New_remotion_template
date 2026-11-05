import type { Direction, LineRecipe, MotionCurve, Recipe } from "../types";
import type { Vec } from "./blur";
import { curveProgress } from "./curve";
import { EASINGS } from "./easing";

export type PoseSchedule = {
  enterStart: number;
  enterFrames: number;
  settleFrames: number;
  exitStart: number;
  exitFrames: number;
  fadeOnlyExit: boolean;
};

export type Pose = { x: number; y: number; scale: number; opacity: number; resting: boolean; entranceFrame: number };

export type PoseInput = {
  schedule: PoseSchedule;
  recipe: LineRecipe;
  settle: Recipe["settle"];
  enterDistance: number;
  exitDistance: number;
  fps: number;
};

const DIRECTION: Record<Direction, Vec> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 },
};

const OVERSHOOTING_CURVES: ReadonlySet<MotionCurve> = new Set(["outBack", "pop", "bouncy", "snappy"]);
const SETTLE_LEAD = 0.5;
const FADE_PORTION = 0.55;
const SETTLE_PEAK = 0.03456;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutQuad = (v: number): number => 1 - (1 - v) * (1 - v);

export function curveOvershoots(curve: MotionCurve): boolean {
  return OVERSHOOTING_CURVES.has(curve);
}

export function settleBump(s: number): number {
  if (s <= 0 || s >= 1) return 0;
  return (s * s * (1 - s) ** 3) / SETTLE_PEAK;
}

export function settleAmount(t: number, enterFrames: number, settleFrames: number, overshoot: number): number {
  if (overshoot === 0 || settleFrames <= 0) return 0;
  const lead = Math.round(enterFrames * SETTLE_LEAD);
  const start = enterFrames - lead;
  return overshoot * settleBump((t - start) / (lead + settleFrames));
}

export function enterOpacity(t: number, enterFrames: number, fade: boolean): number {
  if (t < 0) return 0;
  if (!fade) return 1;
  return easeOutQuad(clamp01(t / Math.max(1, enterFrames * FADE_PORTION)));
}

export function linePose(frame: number, p: PoseInput): Pose {
  const { schedule, recipe } = p;
  const from = DIRECTION[recipe.enter.from];
  const t = frame - schedule.enterStart;
  const enterT = Math.min(Math.max(0, t), schedule.enterFrames);
  const progress = schedule.enterFrames > 0 ? curveProgress(recipe.enter.ease, enterT, schedule.enterFrames, p.fps) : 1;
  const overshoot = curveOvershoots(recipe.enter.ease) ? 0 : p.settle.overshoot;
  const offset = (1 - progress - settleAmount(t, schedule.enterFrames, schedule.settleFrames, overshoot)) * p.enterDistance;

  let x = from.x * offset;
  let y = from.y * offset;
  const scaleFrom = recipe.enter.scaleFrom;
  const scale = scaleFrom === undefined ? 1 : scaleFrom + (1 - scaleFrom) * progress;
  let opacity = enterOpacity(t, schedule.enterFrames, recipe.enter.fade);

  const e = frame - schedule.exitStart;
  const exiting = e >= 0;
  if (exiting) {
    const q = clamp01(e / Math.max(1, schedule.exitFrames));
    opacity *= 1 - q;
    if (!schedule.fadeOnlyExit) {
      const to = DIRECTION[recipe.exit.to];
      const eased = EASINGS[recipe.exit.ease](q) * p.exitDistance;
      x += to.x * eased;
      y += to.y * eased;
    }
  }

  const resting = !exiting && t >= schedule.enterFrames + schedule.settleFrames;
  if (resting) return { x: 0, y: 0, scale: 1, opacity, resting, entranceFrame: t };
  return { x, y, scale, opacity, resting, entranceFrame: t };
}

export type GlitchWindow = { start: number; frames: number };

export function glitchWindow(enterFrames: number, glitchFrames: number): GlitchWindow {
  const frames = Math.max(1, Math.min(glitchFrames, enterFrames));
  return { start: Math.max(0, Math.round(enterFrames * 0.45) - 1), frames };
}

export function glitchIntensity(entranceFrame: number, window: GlitchWindow): number {
  const i = entranceFrame - window.start;
  if (i < 0 || i >= window.frames) return 0;
  return 1 - i / window.frames;
}

type Box = { x: number; y: number; width: number; height: number };

const OFFSCREEN_MARGIN_U = 40;

export function travelDistance(
  distance: number | "offscreen",
  direction: Direction,
  placed: Box,
  frame: { width: number; height: number },
  unit: number,
): number {
  if (distance !== "offscreen") return distance * unit;
  const margin = OFFSCREEN_MARGIN_U * unit;
  if (direction === "top") return placed.y + placed.height + margin;
  if (direction === "bottom") return frame.height - placed.y + margin;
  if (direction === "left") return placed.x + placed.width + margin;
  if (direction === "right") return frame.width - placed.x + margin;
  return 0;
}
