import type { FontMetrics, InkBounds } from "./layout";

type TextFont = { fontFamily: string; fontWeight: number; fontSize: number; trackingPx: number };

let context: CanvasRenderingContext2D | null = null;

function canvasContext(): CanvasRenderingContext2D | null {
  if (context) return context;
  if (typeof document === "undefined") return null;
  context = document.createElement("canvas").getContext("2d");
  return context;
}

function prepare(ctx: CanvasRenderingContext2D, font: TextFont): void {
  ctx.font = `${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;
  ctx.letterSpacing = `${font.trackingPx}px`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function measureInk(text: string, font: TextFont): { metrics: FontMetrics; ink: InkBounds } | null {
  const ctx = canvasContext();
  if (!ctx || font.fontSize <= 0) return null;
  prepare(ctx, font);
  const line = ctx.measureText(text);
  const em = font.fontSize;
  return {
    metrics: {
      ascent: line.fontBoundingBoxAscent / em,
      descent: line.fontBoundingBoxDescent / em,
      inkAscent: line.actualBoundingBoxAscent / em,
    },
    ink: { left: -line.actualBoundingBoxLeft, right: line.actualBoundingBoxRight },
  };
}
