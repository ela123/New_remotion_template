import type { SpringName } from "../types";

export type SpringPreset = { damping: number; stiffness?: number; mass?: number };

export const SPRINGS: Record<SpringName, SpringPreset> = {
  soft: { damping: 200 },
  snappy: { damping: 20, stiffness: 200 },
  pop: { damping: 12, stiffness: 180 },
  bouncy: { damping: 8 },
};

export function isSpringName(name: string): name is SpringName {
  return Object.prototype.hasOwnProperty.call(SPRINGS, name);
}
