import { describe, expect, it } from "vitest";
import { parseSrt, stripFormatting } from "../src/srt/parse";

describe("stripFormatting", () => {
  it.each([
    ["<i>italic</i> words", "italic words"],
    ["<b>bold</b> and <u>under</u>", "bold and under"],
    ['<font color="#ffcc00">gold</font>', "gold"],
    ["{\\an8}top line", "top line"],
    ["a < b and c > d", "a < b and c > d"],
    ["keep *emphasis* and \\* stars", "keep *emphasis* and \\* stars"],
    ["<I>Upper</I>", "Upper"],
  ])("%j -> %j", (input, expected) => {
    expect(stripFormatting(input)).toBe(expected);
  });
});

describe("parseSrt with player markup", () => {
  it("drops lines that only held markup", () => {
    const { cues } = parseSrt("1\n00:00:01,000 --> 00:00:02,000\n{\\an8}\n<i>Hello</i>\n");
    expect(cues).toEqual([{ id: 1, startMs: 1000, endMs: 2000, lines: ["Hello"] }]);
  });

  it("skips a cue whose text is only markup", () => {
    const { cues, warnings } = parseSrt("1\n00:00:01,000 --> 00:00:02,000\n<i></i>\n");
    expect(cues).toEqual([]);
    expect(warnings[0]?.message).toContain("cue has no text lines");
  });

  it("returns no cues and no warnings for empty or blank input", () => {
    expect(parseSrt("")).toEqual({ cues: [], warnings: [] });
    expect(parseSrt(" \r\n\r\n \n")).toEqual({ cues: [], warnings: [] });
  });
});
