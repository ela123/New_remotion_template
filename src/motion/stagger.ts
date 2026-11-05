import type { Recipe } from "../types";

export function scaleFrames(frames30: number, fps: number): number {
  return Math.round((frames30 * fps) / 30);
}

export function exitOrderIndex(lineIndex: number, lineCount: number, order: Recipe["exitOrder"]): number {
  switch (order) {
    case "reverse":
      return lineCount - 1 - lineIndex;
    case "forward":
      return lineIndex;
    case "together":
      return 0;
  }
}
