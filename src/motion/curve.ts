import { interpolate, spring } from "remotion";
import type { MotionCurve, SpringName } from "../types";
import { EASINGS } from "./easing";
import { isSpringName, SPRINGS } from "./springs";

export function curveProgress(curve: MotionCurve, localFrame: number, frames: number, fps: number): number {
  if (frames <= 0) return localFrame < 0 ? 0 : 1;
  if (isSpringName(curve)) {
    const run = (f: number): number => spring({ frame: f, fps, config: SPRINGS[curve], durationInFrames: frames });
    if (localFrame >= frames) return 1;
    return run(localFrame) / run(frames);
  }
  return interpolate(localFrame, [0, frames], [0, 1], {
    easing: EASINGS[curve],
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function springValue(name: SpringName, localFrame: number, fps: number): number {
  return spring({ frame: localFrame, fps, config: SPRINGS[name] });
}
