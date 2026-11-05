import { describe, expect, it } from "vitest";
import {
  baselineInBox,
  displayableCues,
  layoutBlock,
  lineHeightFor,
  mapLinesToSlots,
  opticalGap,
  type LayoutFrame,
  type MeasuredLine,
} from "../src/template/layout";
import type { AnnotatedLine } from "../src/types";

const line = (text: string): AnnotatedLine => ({
  text,
  words: text.split(" ").map((w) => ({ text: w, startMs: 0, endMs: 0 })),
});

const slots = (texts: string[]) => mapLinesToSlots(texts.map(line)).map((a) => a.slot);

describe("mapLinesToSlots", () => {
  it.each([
    [[], []],
    [["one line here"], ["B"]],
    [["Single", "second line"], ["A", "C"]],
    [["two words", "second line"], ["B", "C"]],
    [["Hook", "a phrase", "the rest of it"], ["A", "B", "C"]],
    [["Hook", "a phrase", "third", "fourth", "fifth"], ["A", "B", "C"]],
  ])("maps %j to %j", (texts, expected) => {
    expect(slots(texts)).toEqual(expected);
  });

  it("merges lines 4+ into slot C keeping word order", () => {
    const result = mapLinesToSlots(["Hook", "a phrase", "third line", "fourth"].map(line));
    const c = result[2];
    expect(c?.slot).toBe("C");
    expect(c?.line.text).toBe("third line fourth");
    expect(c?.line.words.map((w) => w.text)).toEqual(["third", "line", "fourth"]);
  });
});

describe("layoutBlock", () => {
  const frame: LayoutFrame = {
    width: 1920,
    height: 1080,
    safeArea: { x: 0.1, y: 0.1 },
    anchor: { vertical: "bottom", horizontal: "center" },
    align: "center",
    lineGap: 0.1,
  };

  it("anchors the block to the bottom of the safe area and centres lines", () => {
    const block = layoutBlock(
      [
        { slot: "A", fontSize: 100, width: 400, lineHeight: 1.15 },
        { slot: "C", fontSize: 50, width: 800, lineHeight: 1.15 },
      ],
      frame,
    );
    expect(block.y + block.height).toBeCloseTo(1080 - 108);
    expect(block.lines.map((l) => l.x)).toEqual([760, 560]);
    expect(block.lines[1]?.y).toBe(Math.round(block.y + 115 + 5));
  });

  it("scales a line that is wider than the safe width", () => {
    const block = layoutBlock([{ slot: "B", fontSize: 100, width: 3072, lineHeight: 1 }], frame);
    const placed = block.lines[0];
    expect(placed?.width).toBeLessThanOrEqual(1536);
    expect(placed?.fontSize).toBeLessThan(50);
    expect(placed?.x).toBeGreaterThanOrEqual(192);
  });

  it("returns an empty block for no lines", () => {
    const block = layoutBlock([], frame);
    expect(block.lines).toEqual([]);
    expect(block.width).toBe(0);
    expect(Number.isFinite(block.y)).toBe(true);
  });

  it("uses a tighter line box for uppercase lines", () => {
    expect(lineHeightFor(true)).toBeLessThan(lineHeightFor(false));
    const block = layoutBlock(
      [
        { slot: "A", fontSize: 100, width: 400, lineHeight: lineHeightFor(true) },
        { slot: "C", fontSize: 50, width: 400, lineHeight: lineHeightFor(false) },
      ],
      frame,
    );
    expect(block.lines[0]?.height).toBeCloseTo(100);
    expect(block.lines[1]?.height).toBeCloseTo(57.5);
  });

  it("keeps whole-pixel positions for any anchor", () => {
    const anchors = [
      { vertical: "top", horizontal: "left" },
      { vertical: "center", horizontal: "right" },
    ] as const;
    for (const anchor of anchors) {
      const block = layoutBlock([{ slot: "B", fontSize: 63.3, width: 401.7, lineHeight: 1.15 }], { ...frame, anchor, align: "right" });
      const placed = block.lines[0];
      expect(Number.isInteger(placed?.x)).toBe(true);
      expect(Number.isInteger(placed?.y)).toBe(true);
    }
  });
});

describe("optical layout with font metrics", () => {
  const frame: LayoutFrame = {
    width: 1920,
    height: 1080,
    safeArea: { x: 0.1, y: 0.1 },
    anchor: { vertical: "bottom", horizontal: "center" },
    align: "left",
    lineGap: 0.12,
  };
  const metrics = { ascent: 0.95, descent: 0.25, inkAscent: 0.7 };
  const a: MeasuredLine = { slot: "A", fontSize: 150, width: 600, lineHeight: 1, metrics, ink: { left: 9, right: 590 } };
  const c: MeasuredLine = { slot: "C", fontSize: 46, width: 700, lineHeight: 1.15, metrics, ink: { left: 2, right: 699 }, trackingEm: 0.2 };

  it("finds the baseline from the half-leading", () => {
    expect(baselineInBox({ fontSize: 100, lineHeight: 1, metrics })).toBeCloseTo(-10 + 95);
    expect(baselineInBox({ fontSize: 100, lineHeight: 1 })).toBeCloseTo(80);
  });

  it("keeps the visible gap between baseline and the next line's ink top", () => {
    const block = layoutBlock([a, c], frame);
    const [la, lc] = block.lines;
    if (!la || !lc) throw new Error("missing lines");
    const baselineA = la.y + la.baseline;
    const inkTopC = lc.y + lc.baseline - metrics.inkAscent * c.fontSize;
    expect(Math.abs(inkTopC - baselineA - opticalGap(a, c, 0.12, 1))).toBeLessThanOrEqual(1);
  });

  it("opens the gap for tracked lines and scales it with size", () => {
    const plain = { ...c, trackingEm: 0 };
    expect(opticalGap(a, c, 0.12, 1)).toBeGreaterThan(opticalGap(a, plain, 0.12, 1));
    expect(opticalGap(a, a, 0.12, 1)).toBeGreaterThan(opticalGap(c, plain, 0.12, 1));
    expect(opticalGap(a, plain, 0.12, 2)).toBeGreaterThan(opticalGap(a, plain, 0.12, 1));
  });

  it("aligns ink edges instead of advance boxes", () => {
    const left = layoutBlock([a, c], frame).lines.map((l) => l.x + (l.ink?.left ?? 0));
    expect(Math.abs((left[0] ?? 0) - (left[1] ?? 0))).toBeLessThanOrEqual(1);
    const right = layoutBlock([a, c], { ...frame, align: "right" }).lines.map((l) => l.x + (l.ink?.right ?? 0));
    expect(Math.abs((right[0] ?? 0) - (right[1] ?? 0))).toBeLessThanOrEqual(1);
  });

  it("scales ink bounds with a line that is fitted down", () => {
    const wide: MeasuredLine = { ...c, width: 3000, ink: { left: 10, right: 2990 } };
    const placed = layoutBlock([wide], frame).lines[0];
    expect(placed?.ink?.right).toBeLessThan(1536);
    expect(placed?.ink?.left).toBeLessThan(10);
  });
});

describe("displayableCues", () => {
  it("drops blank lines and empty cues and sorts by start", () => {
    const cues = displayableCues([
      { id: 2, startMs: 3000, endMs: 4000, lines: [line("later")] },
      { id: 1, startMs: 0, endMs: 1000, lines: [{ text: "", words: [] }, line("kept")] },
      { id: 3, startMs: 500, endMs: 900, lines: [] },
      { id: 4, startMs: Number.NaN, endMs: 900, lines: [line("bad")] },
    ]);
    expect(cues.map((c) => c.id)).toEqual([1, 2]);
    expect(cues[0]?.lines.map((l) => l.text)).toEqual(["kept"]);
  });
});
