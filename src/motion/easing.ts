import { Easing } from "remotion";
import type { EaseName } from "../types";

export const EASINGS: Record<EaseName, (t: number) => number> = {
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  outCubic: Easing.bezier(0.33, 1, 0.68, 1),
  inCubic: Easing.bezier(0.32, 0, 0.67, 0),
  inOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
  outBack: Easing.bezier(0.34, 1.56, 0.64, 1),
};
