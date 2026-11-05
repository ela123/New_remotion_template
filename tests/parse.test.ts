import { describe, expect, it } from "vitest";
import { annotateCue, annotateCues } from "../src/srt/annotate";
import { getAnalyzer, llmAnalyzer, markersAnalyzer } from "../src/srt/analyze";
import { formatTimestamp, parseEmphasisLine, parseSrt, serializeSrt } from "../src/srt/parse";
import type { RawCue } from "../src/types";

const SAMPLE = `1
00:00:00,500 --> 00:00:02,700
Welcome
to the *studio*

2
00:00:03,300 --> 00:00:05,600
Every frame *matters*
`;

describe("parseSrt", () => {
  it("parses blocks and preserves line breaks and markers", () => {
    const { cues, warnings } = parseSrt(SAMPLE);
    expect(warnings).toEqual([]);
    expect(cues).toEqual([
      { id: 1, startMs: 500, endMs: 2700, lines: ["Welcome", "to the *studio*"] },
      { id: 2, startMs: 3300, endMs: 5600, lines: ["Every frame *matters*"] },
    ]);
  });

  it("tolerates a BOM and CRLF line endings", () => {
    const { cues, warnings } = parseSrt(`﻿${SAMPLE.replace(/\n/g, "\r\n")}`);
    expect(warnings).toEqual([]);
    expect(cues.map((cue) => cue.lines)).toEqual([["Welcome", "to the *studio*"], ["Every frame *matters*"]]);
    expect(cues[0]?.id).toBe(1);
  });

  it("accepts dots instead of commas in timestamps", () => {
    const { cues } = parseSrt("1\n00:00:01.250 --> 00:01:02.5\nHello\n");
    expect(cues[0]).toMatchObject({ startMs: 1250, endMs: 62_500 });
  });

  it("ignores extra blank lines between, before and after blocks", () => {
    const { cues, warnings } = parseSrt(`\n\n${SAMPLE.replace("\n\n2", "\n\n\n   \n\n2")}\n\n\n`);
    expect(warnings).toEqual([]);
    expect(cues).toHaveLength(2);
  });

  it("skips an invalid block and names its index and line", () => {
    const text = `${SAMPLE}\n3\n00:00:07 --> broken\nNope\n\n4\n00:00:08,000 --> 00:00:09,000\nStill parsed\n`;
    const { cues, warnings } = parseSrt(text);
    expect(cues.map((cue) => cue.id)).toEqual([1, 2, 4]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "invalid-block", line: 11 });
    expect(warnings[0]?.message).toContain("block 3");
    expect(warnings[0]?.message).toContain("line 11");
  });

  it("skips blocks whose end is not after the start or that have no text", () => {
    const { cues, warnings } = parseSrt("1\n00:00:02,000 --> 00:00:01,000\nBackwards\n\n2\n00:00:03,000 --> 00:00:04,000\n");
    expect(cues).toEqual([]);
    expect(warnings.map((warning) => warning.code)).toEqual(["invalid-block", "invalid-block"]);
  });

  it("accepts a block without an index line", () => {
    const { cues } = parseSrt("00:00:01,000 --> 00:00:02,000\nNo index\n");
    expect(cues[0]).toMatchObject({ id: 1, lines: ["No index"] });
  });

  it("applies a positive offset", () => {
    const { cues } = parseSrt(SAMPLE, { offsetMs: 250 });
    expect(cues[0]).toMatchObject({ startMs: 750, endMs: 2950 });
  });

  it("clamps a negative offset at zero and skips cues pushed fully before zero", () => {
    const { cues, warnings } = parseSrt(SAMPLE, { offsetMs: -1000 });
    expect(cues[0]).toMatchObject({ startMs: 0, endMs: 1700 });
    const shifted = parseSrt(SAMPLE, { offsetMs: -3000 });
    expect(warnings).toEqual([]);
    expect(shifted.cues.map((cue) => cue.id)).toEqual([2]);
    expect(shifted.warnings[0]?.code).toBe("invalid-block");
  });

  it("round-trips through serializeSrt", () => {
    const { cues } = parseSrt(SAMPLE);
    expect(parseSrt(serializeSrt(cues)).cues).toEqual(cues);
    expect(serializeSrt(cues)).toContain("00:00:00,500 --> 00:00:02,700\nWelcome\nto the *studio*\n");
  });
});

describe("parseEmphasisLine", () => {
  it("marks a single emphasized word and strips the markers", () => {
    expect(parseEmphasisLine("to the *studio*")).toEqual({
      words: [
        { text: "to", emphasis: false },
        { text: "the", emphasis: false },
        { text: "studio", emphasis: true },
      ],
      unbalanced: false,
    });
  });

  it("marks every word of a multi-word marker", () => {
    const { words } = parseEmphasisLine("press *play right* now");
    expect(words.map((word) => word.emphasis)).toEqual([false, true, true, false]);
    expect(words.map((word) => word.text)).toEqual(["press", "play", "right", "now"]);
  });

  it("keeps trailing punctuation outside a marker on the word", () => {
    expect(parseEmphasisLine("*studio*, now").words[0]).toEqual({ text: "studio,", emphasis: true });
  });

  it("treats an escaped asterisk as a literal character", () => {
    const { words, unbalanced } = parseEmphasisLine("5 \\* 3 is *fifteen*");
    expect(unbalanced).toBe(false);
    expect(words.map((word) => word.text)).toEqual(["5", "*", "3", "is", "fifteen"]);
    expect(words.map((word) => word.emphasis)).toEqual([false, false, false, false, true]);
  });

  it("ends an unclosed marker at the end of the line and reports it", () => {
    const { words, unbalanced } = parseEmphasisLine("this is *very loud");
    expect(unbalanced).toBe(true);
    expect(words.map((word) => word.emphasis)).toEqual([false, false, true, true]);
    expect(words.every((word) => !word.text.includes("*"))).toBe(true);
  });
});

describe("annotate and analyzers", () => {
  it("builds annotated lines without markers and with emphasis flags", () => {
    const cue = annotateCue({ id: 7, startMs: 0, endMs: 1000, lines: ["Welcome", "to the *studio*"] });
    expect(cue.lines.map((line) => line.text)).toEqual(["Welcome", "to the studio"]);
    expect(cue.lines[1]?.words[2]).toMatchObject({ text: "studio", emphasis: true });
    expect(cue.lines[1]?.words[2]?.endMs).toBe(1000);
  });

  it("drops lines that contain no words", () => {
    expect(annotateCues([{ id: 1, startMs: 0, endMs: 500, lines: ["*", "hi"] }])[0]?.lines).toHaveLength(1);
  });

  it("markers analyzer annotates and llm analyzer rejects", async () => {
    const { cues } = parseSrt(SAMPLE);
    await expect(markersAnalyzer.analyze(cues)).resolves.toEqual(annotateCues(cues));
    await expect(llmAnalyzer.analyze(cues)).rejects.toThrow("LLM provider not implemented yet");
    expect(getAnalyzer("llm")).toBe(llmAnalyzer);
    expect(getAnalyzer("markers")).toBe(markersAnalyzer);
  });
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type GeneratedSrt = { text: string; expected: RawCue[]; invalidBlocks: number };

function generateSrt(random: () => number): GeneratedSrt {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const timestamp = (ms: number) => {
    const separator = random() < 0.3 ? "." : ",";
    return formatTimestamp(ms).replace(",", separator);
  };
  const blankRun = () => "\n".repeat(2 + Math.floor(random() * 3));
  const blocks: string[] = [];
  const expected: RawCue[] = [];
  let invalidBlocks = 0;
  let time = 0;
  const count = 1 + Math.floor(random() * 12);
  for (let id = 1; id <= count; id++) {
    const startMs = time + Math.floor(random() * 800);
    const endMs = startMs + 1 + Math.floor(random() * 5000);
    time = endMs;
    if (random() < 0.15) {
      blocks.push(`${id}\n${pick(["garbage", "00:00:01 -> 00:00:02", "--> 00:00:01,000"])}\nbroken text`);
      invalidBlocks++;
      continue;
    }
    const lines = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
      Array.from({ length: 1 + Math.floor(random() * 5) }, () => pick(["hello", "*loud*", "\\*", "world,", "*two", "words*", "end."])).join(" "),
    );
    blocks.push([String(id), `${timestamp(startMs)} --> ${timestamp(endMs)}`, ...lines].join("\n"));
    expected.push({ id, startMs, endMs, lines });
  }
  let text = blocks.map((block) => `${block}${blankRun()}`).join("");
  if (random() < 0.5) text = text.replace(/\n/g, "\r\n");
  if (random() < 0.5) text = `﻿${text}`;
  return { text, expected, invalidBlocks };
}

describe("parseSrt fuzz", () => {
  it("recovers every valid block from seeded random SRT text", () => {
    const random = mulberry32(7);
    for (let run = 0; run < 300; run++) {
      const { text, expected, invalidBlocks } = generateSrt(random);
      const { cues, warnings } = parseSrt(text);
      expect(cues).toEqual(expected);
      expect(warnings).toHaveLength(invalidBlocks);
      expect(warnings.every((warning) => warning.code === "invalid-block" && warning.line !== undefined)).toBe(true);
      expect(parseSrt(serializeSrt(cues)).cues).toEqual(cues);
    }
  });

  it("parses a few hundred cues quickly", () => {
    const blocks = Array.from({ length: 600 }, (_, index) =>
      `${index + 1}\n${formatTimestamp(index * 2000)} --> ${formatTimestamp(index * 2000 + 1500)}\nline *one* here\nline two`,
    );
    const started = performance.now();
    const { cues } = parseSrt(blocks.join("\n\n"));
    expect(cues).toHaveLength(600);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
