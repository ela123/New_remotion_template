import { describe, expect, it } from "vitest";
import { parseEmphasisLine } from "../src/srt/parse";
import { estimateWordTimings, msToFrames } from "../src/srt/timing";

const words = (line: string) => parseEmphasisLine(line).words;

describe("frame conversion", () => {
  it("rounds ms to the nearest frame", () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(517, 30)).toBe(16);
    expect(msToFrames(1000, 29.97)).toBe(30);
    expect(msToFrames(1001, 30000 / 1001)).toBe(30);
    expect(msToFrames(2500, 59.94)).toBe(150);
  });
});

describe("estimateWordTimings", () => {
  const timings = estimateWordTimings([words("Welcome"), words("to the *studio*"), words("where ideas, become motion")], 500, 2700);
  const flat = timings.flat();

  it("keeps the line structure", () => {
    expect(timings.map((line) => line.length)).toEqual([1, 3, 4]);
    expect(timings[1]?.[2]).toMatchObject({ text: "studio", emphasis: true });
  });

  it("covers the cue span exactly and contiguously in reading order", () => {
    expect(flat[0]?.startMs).toBe(500);
    expect(flat[flat.length - 1]?.endMs).toBe(2700);
    flat.forEach((word, index) => {
      expect(word.endMs).toBeGreaterThan(word.startMs);
      const next = flat[index + 1];
      if (next) expect(next.startMs).toBeCloseTo(word.endMs, 9);
    });
  });

  it("sums word durations to the cue duration", () => {
    const total = flat.reduce((sum, word) => sum + (word.endMs - word.startMs), 0);
    expect(total).toBeCloseTo(2200, 6);
  });

  it("weights by character count plus one", () => {
    const [[short, long] = []] = estimateWordTimings([words("ab abcde")], 0, 1000);
    expect(short && short.endMs - short.startMs).toBeCloseTo((3 / 9) * 1000, 6);
    expect(long && long.endMs - long.startMs).toBeCloseTo((6 / 9) * 1000, 6);
  });

  it("adds two weight units for words ending in punctuation", () => {
    const [[plain, punctuated] = []] = estimateWordTimings([words("abc abc.")], 0, 1100);
    expect(plain && plain.endMs - plain.startMs).toBeCloseTo(400, 6);
    expect(punctuated && punctuated.endMs - punctuated.startMs).toBeCloseTo(700, 6);
  });

  it("returns empty lines when there are no words", () => {
    expect(estimateWordTimings([[]], 0, 1000)).toEqual([[]]);
  });
});
