const REFERENCE_SHORT_SIDE = 1080;

export function referenceUnit(width: number, height: number): number {
  return Math.min(width, height) / REFERENCE_SHORT_SIDE;
}
