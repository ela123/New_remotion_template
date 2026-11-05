import { describe, expect, it } from "vitest";
import { checkCues } from "../src/srt/check";
import type { RawCue } from "../src/types";

const cue = (id: number, startMs: number, endMs: number, lines: string[]): RawCue => ({ id, startMs, endMs, lines });
const codes = (cues: RawCue[], videoDurationMs?: number) =>
  checkCues(cues, videoDurationMs === undefined ? {} : { videoDurationMs }).map((warning) => warning.code);

describe("checkCues", () => {
  it("returns nothing for a clean cue", () => {
    expect(checkCues([cue(1, 0, 2000, ["Welcome", "to the *studio*"])], { videoDurationMs: 5000 })).toEqual([]);
  });

  it("flags overlapping cues", () => {
    const warnings = checkCues([cue(1, 0, 2000, ["one"]), cue(2, 1500, 3000, ["two"])]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "overlap", cueId: 1 });
    expect(warnings[0]?.message).toContain("500 ms");
  });

  it("flags every cue a long cue overlaps, not only its neighbour", () => {
    const warnings = checkCues([cue(1, 0, 9000, ["long"]), cue(2, 1000, 2000, ["two"]), cue(3, 3000, 4000, ["three"])]);
    const overlaps = warnings.filter((warning) => warning.code === "overlap").map((warning) => warning.message);
    expect(overlaps).toEqual([expect.stringContaining("overlaps cue 2 by 1000 ms"), expect.stringContaining("overlaps cue 3 by 1000 ms")]);
  });

  it("flags cues shorter than 400 ms", () => {
    expect(codes([cue(1, 0, 399, ["hi"])])).toContain("too-short");
    expect(codes([cue(1, 0, 400, ["hi"])])).not.toContain("too-short");
  });

  it("flags cues longer than 6 s", () => {
    expect(codes([cue(1, 0, 6001, ["hello"])])).toEqual(["too-long"]);
  });

  it("flags more than three lines", () => {
    expect(codes([cue(1, 0, 3000, ["a", "b", "c", "d"])])).toEqual(["too-many-lines"]);
  });

  it("flags lines longer than 28 visible characters, ignoring markers", () => {
    expect(codes([cue(1, 0, 3000, ["*abcdefghij* *klmnopqrst* abcdef"])])).toEqual([]);
    const warnings = checkCues([cue(1, 0, 3000, ["short", "this line is clearly far too long now"])]);
    expect(warnings).toEqual([expect.objectContaining({ code: "line-too-long", line: 2, cueId: 1 })]);
  });

  it("flags cues that end after the video", () => {
    expect(codes([cue(1, 0, 2000, ["hi there"])], 1500)).toEqual(["beyond-video"]);
    expect(codes([cue(1, 0, 2000, ["hi there"])])).toEqual([]);
  });

  it("flags reading speed above 20 characters per second", () => {
    expect(codes([cue(1, 0, 1000, ["twenty one characters"])])).toEqual(["reading-speed"]);
    expect(codes([cue(1, 0, 1000, ["exactly twenty chars"])])).toEqual([]);
  });

  it("flags unbalanced emphasis markers with the line number", () => {
    const warnings = checkCues([cue(1, 0, 2000, ["fine", "*not closed"])]);
    expect(warnings).toEqual([expect.objectContaining({ code: "unbalanced-marker", line: 2 })]);
  });
});
