import type {
  Align,
  AnnotatedCue,
  AnnotatedLine,
  HorizontalAnchor,
  SlotName,
  VerticalAnchor,
} from "../types";
import { referenceUnit } from "./units";

export type SlotAssignment = { slot: SlotName; line: AnnotatedLine };

export type Rect = { x: number; y: number; width: number; height: number };

export type FontMetrics = { ascent: number; descent: number; inkAscent: number };

export type InkBounds = { left: number; right: number };

export type MeasuredLine = {
  slot: SlotName;
  fontSize: number;
  width: number;
  lineHeight: number;
  trackingEm?: number;
  metrics?: FontMetrics;
  ink?: InkBounds;
};

export type PlacedLine = MeasuredLine & Rect & { baseline: number };

export type BlockLayout = Rect & { lines: PlacedLine[] };

export type LayoutFrame = {
  width: number;
  height: number;
  safeArea: { x: number; y: number };
  anchor: { vertical: VerticalAnchor; horizontal: HorizontalAnchor };
  align: Align;
  lineGap: number;
};

const LINE_HEIGHT = 1.15;
const CAPS_LINE_HEIGHT = 1.0;

const OPTICAL_GAP = { perEm: 2, baseU: 80, perTracking: 2 } as const;
const FALLBACK_BASELINE = 0.8;

export const lineHeightFor = (uppercase: boolean): number => (uppercase ? CAPS_LINE_HEIGHT : LINE_HEIGHT);

const isSingleWord = (line: AnnotatedLine): boolean =>
  line.words.length === 1 || (line.words.length === 0 && !/\s/.test(line.text.trim()));

const mergeLines = (lines: AnnotatedLine[]): AnnotatedLine => ({
  text: lines.map((l) => l.text).join(" "),
  words: lines.flatMap((l) => l.words),
});

export function mapLinesToSlots(lines: AnnotatedLine[]): SlotAssignment[] {
  const [first, second, third] = lines;
  if (!first) return [];
  if (!second) return [{ slot: "B", line: first }];
  if (!third) {
    return [
      { slot: isSingleWord(first) ? "A" : "B", line: first },
      { slot: "C", line: second },
    ];
  }
  return [
    { slot: "A", line: first },
    { slot: "B", line: second },
    { slot: "C", line: lines.length > 3 ? mergeLines(lines.slice(2)) : third },
  ];
}

export function lineText(line: AnnotatedLine): string {
  return line.words.length > 0 ? line.words.map((w) => w.text).join(" ") : line.text.trim();
}

export function displayableCues(cues: AnnotatedCue[]): AnnotatedCue[] {
  return [...cues]
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue) => ({ ...cue, lines: cue.lines.filter((l) => lineText(l).trim() !== "") }))
    .filter((cue) => cue.lines.length > 0 && Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs));
}

function safeRect(frame: Pick<LayoutFrame, "width" | "height" | "safeArea">): Rect {
  const x = Math.round(frame.width * frame.safeArea.x);
  const y = Math.round(frame.height * frame.safeArea.y);
  return { x, y, width: frame.width - 2 * x, height: frame.height - 2 * y };
}

function fitLine(fontSize: number, measuredWidth: number, maxWidth: number): { fontSize: number; width: number } {
  if (measuredWidth <= maxWidth || measuredWidth <= 0) return { fontSize, width: measuredWidth };
  const ratio = (maxWidth / measuredWidth) * 0.995;
  return { fontSize: fontSize * ratio, width: measuredWidth * ratio };
}

function fitMeasured(line: MeasuredLine, maxWidth: number): MeasuredLine {
  const fitted = fitLine(line.fontSize, line.width, maxWidth);
  const ratio = line.fontSize > 0 ? fitted.fontSize / line.fontSize : 1;
  const ink = line.ink ? { left: line.ink.left * ratio, right: line.ink.right * ratio } : undefined;
  return { ...line, ...fitted, ink };
}

const inkOf = (line: MeasuredLine): InkBounds => line.ink ?? { left: 0, right: line.width };

export function baselineInBox(line: Pick<MeasuredLine, "fontSize" | "lineHeight" | "metrics">): number {
  const box = line.fontSize * line.lineHeight;
  const m = line.metrics;
  if (!m) return box * FALLBACK_BASELINE;
  return (box - (m.ascent + m.descent) * line.fontSize) / 2 + m.ascent * line.fontSize;
}

const inkTopInBox = (line: MeasuredLine): number =>
  baselineInBox(line) - (line.metrics?.inkAscent ?? 0) * line.fontSize;

export function opticalGap(upper: MeasuredLine, lower: MeasuredLine, lineGap: number, unit: number): number {
  const tracking = Math.max(0, upper.trackingEm ?? 0, lower.trackingEm ?? 0);
  const base = OPTICAL_GAP.perEm * Math.sqrt(upper.fontSize * lower.fontSize) + OPTICAL_GAP.baseU * unit;
  return lineGap * base * (1 + OPTICAL_GAP.perTracking * tracking);
}

function stackTops(lines: MeasuredLine[], lineGap: number, unit: number): number[] {
  const tops: number[] = [];
  let cursor = 0;
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const prevTop = tops[i - 1];
    if (!prev || prevTop === undefined) {
      tops.push(0);
    } else if (prev.metrics && line.metrics) {
      tops.push(prevTop + baselineInBox(prev) + opticalGap(prev, line, lineGap, unit) - inkTopInBox(line));
    } else {
      tops.push(cursor + lineGap * line.fontSize);
    }
    cursor = (tops[i] ?? 0) + line.fontSize * line.lineHeight;
  });
  return tops;
}

const alignOffset = (align: Align | HorizontalAnchor, outer: number, inner: number): number => {
  if (align === "left") return 0;
  if (align === "right") return outer - inner;
  return (outer - inner) / 2;
};

const anchorOffset = (anchor: VerticalAnchor, outer: number, inner: number): number => {
  if (anchor === "top") return 0;
  if (anchor === "bottom") return outer - inner;
  return (outer - inner) / 2;
};

export function layoutBlock(lines: MeasuredLine[], frame: LayoutFrame): BlockLayout {
  const safe = safeRect(frame);
  const fitted = lines.map((line) => fitMeasured(line, safe.width));
  const inkWidths = fitted.map((l) => {
    const ink = inkOf(l);
    return ink.right - ink.left;
  });
  const blockWidth = Math.max(0, ...inkWidths);
  const heights = fitted.map((l) => l.fontSize * l.lineHeight);
  const tops = stackTops(fitted, frame.lineGap, referenceUnit(frame.width, frame.height));
  const first = Math.min(0, ...tops);
  const last = Math.max(0, ...tops.map((t, i) => t + (heights[i] ?? 0)));
  const blockHeight = last - first;
  const blockX = safe.x + alignOffset(frame.anchor.horizontal, safe.width, blockWidth);
  const blockY = safe.y + anchorOffset(frame.anchor.vertical, safe.height, blockHeight);

  const placed = fitted.map((line, i): PlacedLine => {
    const height = heights[i] ?? 0;
    const inkX = blockX + alignOffset(frame.align, blockWidth, inkWidths[i] ?? 0);
    return {
      ...line,
      x: Math.round(inkX - inkOf(line).left),
      y: Math.round(blockY + (tops[i] ?? 0) - first),
      height,
      baseline: baselineInBox(line),
    };
  });

  return { x: blockX, y: blockY, width: blockWidth, height: blockHeight, lines: placed };
}
