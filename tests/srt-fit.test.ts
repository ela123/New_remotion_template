import { describe, expect, it } from "vitest";
import { DEFAULT_FIT_OPTIONS, fitCues, HOOK_LINE_LIMITS, type FitOptions } from "../src/srt/fit";
import { parseEmphasisLine, parseSrt, serializeSrt } from "../src/srt/parse";
import type { RawCue } from "../src/types";

const cue = (id: number, startMs: number, endMs: number, lines: string[]): RawCue => ({ id, startMs, endMs, lines });

const visibleWords = (cues: RawCue[]) =>
  cues.flatMap((item) => item.lines.flatMap((line) => parseEmphasisLine(line).words));

const visibleLength = (line: string) =>
  parseEmphasisLine(line)
    .words.map((word) => word.text)
    .join(" ").length;

function hookLimits(lines: string[]): readonly number[] {
  const [a, b, c] = HOOK_LINE_LIMITS;
  if (lines.length === 1) return [b];
  if (lines.length === 2) return parseEmphasisLine(lines[0] ?? "").words.length === 1 ? [a, c] : [b, c];
  return HOOK_LINE_LIMITS;
}

function expectInvariants(input: RawCue[], options: Partial<FitOptions> = {}) {
  const resolved = { ...DEFAULT_FIT_OPTIONS, ...options };
  const { cues, summary } = fitCues(input, options);

  expect(visibleWords(cues)).toEqual(visibleWords([...input].sort((a, b) => a.startMs - b.startMs)));
  expect(parseSrt(serializeSrt(cues)).cues).toEqual(cues);
  expect(summary.outputChunks).toBe(cues.length);
  expect(summary.inputCues).toBe(input.length);

  cues.forEach((chunk, index) => {
    expect(chunk.id).toBe(index + 1);
    expect(chunk.endMs).toBeGreaterThan(chunk.startMs);
    expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(resolved.maxDur * 1000);
    const next = cues[index + 1];
    if (next) expect(next.startMs).toBeGreaterThanOrEqual(chunk.endMs);

    for (const line of chunk.lines) expect(parseEmphasisLine(line).unbalanced).toBe(false);
    expect(chunk.lines.length).toBeLessThanOrEqual(resolved.maxLines);
    expect(visibleWords([chunk]).length).toBeLessThanOrEqual(resolved.maxWords);

    const limits = resolved.strategy === "hook" ? hookLimits(chunk.lines) : chunk.lines.map(() => resolved.maxChars);
    chunk.lines.forEach((line, lineIndex) => expect(visibleLength(line)).toBeLessThanOrEqual(limits[lineIndex] ?? 0));
    if (resolved.strategy === "hook" && chunk.lines.length === 3) {
      expect(parseEmphasisLine(chunk.lines[0] ?? "").words).toHaveLength(1);
    }
  });
  return { cues, summary };
}

describe("fitCues", () => {
  it("re-chunks a long messy cue into hook-shaped chunks", () => {
    const input = [
      cue(1, 0, 6000, ["so this is a really long caption line that someone typed, and it keeps going", "*without any* real structure"]),
    ];
    const { cues } = expectInvariants(input);
    expect(cues.length).toBeGreaterThan(2);
    expect(cues.some((chunk) => chunk.lines.length === 3)).toBe(true);
  });

  it("produces 3-line hook chunks with a single word first", () => {
    const { cues } = expectInvariants([cue(1, 0, 2500, ["Welcome to the studio where ideas become motion"])]);
    expect(cues.map((chunk) => chunk.lines)).toEqual([
      ["Welcome", "to the", "studio"],
      ["where", "ideas", "become motion"],
    ]);
  });

  it("uses fewer lines when the chunk is short", () => {
    const { cues } = expectInvariants([cue(1, 0, 1500, ["Ready? let's *begin*"])]);
    expect(cues[0]?.lines).toEqual(["Ready?", "let's *begin*"]);
  });

  it("prefers sentence ends, then clause punctuation, then conjunctions", () => {
    const { cues } = expectInvariants([
      cue(1, 0, 8000, ["We built it fast. It works well, but we kept testing because bugs hide everywhere"]),
    ]);
    const firstWordsOf = cues.map((chunk) => parseEmphasisLine(chunk.lines[0] ?? "").words[0]?.text);
    expect(firstWordsOf).toContain("It");
    expect(firstWordsOf).toContain("but");
  });

  it("closes and reopens emphasis across lines and chunks", () => {
    const { cues } = expectInvariants([
      cue(1, 0, 4000, ["*every single word in this long sentence is loud and proud today*"]),
    ]);
    expect(cues.length).toBeGreaterThan(1);
    expect(visibleWords(cues).every((word) => word.emphasis)).toBe(true);
    for (const chunk of cues) for (const line of chunk.lines) expect(line.startsWith("*") && line.endsWith("*")).toBe(true);
  });

  it("balances an unclosed source marker and keeps escaped asterisks", () => {
    const { cues } = expectInvariants([cue(1, 0, 3000, ["5 \\* 3 is *fifteen", "right"])]);
    const text = serializeSrt(cues);
    expect(text).toContain("\\*");
    expect(visibleWords(cues).map((word) => word.emphasis)).toEqual([false, false, false, false, true, false]);
  });

  it("never leaves a lone tiny word chunk unless it was a single-word cue", () => {
    const { cues } = expectInvariants([cue(1, 0, 3000, ["one two three four five six seven an"])]);
    expect(cues.every((chunk) => visibleWords([chunk]).length > 1)).toBe(true);
    const solo = expectInvariants([cue(1, 0, 600, ["Go"]), cue(2, 2000, 3000, ["somewhere else"])]);
    expect(solo.cues[0]?.lines).toEqual(["Go"]);
  });

  it("does not merge across a pause between source cues", () => {
    const { cues } = expectInvariants([cue(1, 0, 1000, ["first part"]), cue(2, 2000, 3000, ["second part"])]);
    expect(cues).toHaveLength(2);
  });

  it("enforces min duration and extends toward reading speed when the gap allows", () => {
    const { cues } = expectInvariants([cue(1, 1000, 1300, ["Hello there"]), cue(2, 5000, 6000, ["Next"])]);
    expect(cues[0]?.endMs).toBe(1000 + 800);
    const reading = expectInvariants([cue(1, 0, 900, ["a considerably wordy line"]), cue(2, 5000, 6000, ["x y"])]);
    expect(reading.cues[0]?.endMs).toBe(Math.round((25 / 17) * 1000));
  });

  it("enforces max duration", () => {
    const { cues } = expectInvariants([cue(1, 0, 9000, ["Extraordinary"])]);
    expect(cues[0]?.endMs).toBe(4000);
  });

  it("removes overlaps and closes gaps under 100 ms", () => {
    const { cues } = expectInvariants([
      cue(1, 0, 2000, ["overlapping source text here"]),
      cue(2, 1500, 3000, ["second cue also here"]),
      cue(3, 3550, 4500, ["third after gap"]),
      cue(4, 4560, 5600, ["fourth nearly touching"]),
    ], { maxWords: 3 });
    const third = cues.find((chunk) => chunk.lines.join(" ").includes("third"));
    const fourth = cues.find((chunk) => chunk.lines.join(" ").includes("fourth"));
    expect(third && fourth && fourth.startMs - third.endMs).toBe(0);
  });

  it("orders out-of-order source cues by time", () => {
    expectInvariants([cue(2, 3000, 4000, ["later words"]), cue(1, 0, 1000, ["earlier words"])]);
  });

  it("balanced strategy evens lines without an orphan last word", () => {
    const { cues } = expectInvariants([cue(1, 0, 3000, ["Press play on your brand new intro"])], { strategy: "balanced" });
    for (const chunk of cues) {
      const lines = chunk.lines.map((line) => parseEmphasisLine(line).words.length);
      if (lines.length > 1 && lines.reduce((a, b) => a + b, 0) > lines.length) expect(lines[lines.length - 1]).toBeGreaterThan(1);
    }
  });

  it("honours custom limits", () => {
    expectInvariants(
      [cue(1, 0, 6000, ["a fairly long sentence that needs splitting into several smaller balanced pieces for display"])],
      { strategy: "balanced", maxLines: 2, maxChars: 16, maxWords: 4 },
    );
    expectInvariants([cue(1, 0, 6000, ["hook strategy with only two lines allowed in each chunk please"])], { maxLines: 2 });
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

const VOCABULARY = ["a", "I", "we", "go", "the", "and", "but", "so", "or", "because", "motion", "studio", "frame", "voice", "clock", "sharp", "shimmer", "remarkable", "captions", "timing", "x"];
const PUNCTUATION = ["", "", "", "", ",", ".", "?", "!", ";"];

function generateCues(random: () => number): RawCue[] {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const cues: RawCue[] = [];
  let time = Math.floor(random() * 500);
  const cueCount = 1 + Math.floor(random() * 6);
  for (let id = 1; id <= cueCount; id++) {
    const lineCount = 1 + Math.floor(random() * 4);
    const lines = Array.from({ length: lineCount }, () => {
      const words = Array.from({ length: 1 + Math.floor(random() * 6) }, () => `${pick(VOCABULARY)}${pick(PUNCTUATION)}`);
      if (random() < 0.4) {
        const from = Math.floor(random() * words.length);
        const to = from + Math.floor(random() * (words.length - from));
        words[from] = `*${words[from] ?? ""}`;
        if (random() < 0.85) words[to] = `${words[to] ?? ""}*`;
      }
      if (random() < 0.1) words.push("\\*");
      return words.join(" ");
    });
    const duration = 200 + Math.floor(random() * 6000);
    cues.push({ id, startMs: time, endMs: time + duration, lines });
    time += duration + Math.floor(random() * 1200) - 400;
    time = Math.max(0, time);
  }
  return cues;
}

describe("fitCues property check", () => {
  it("keeps every invariant across generated inputs", { timeout: 20000 }, () => {
    const random = mulberry32(20261002);
    for (let run = 0; run < 250; run++) {
      const input = generateCues(random);
      const strategy = run % 2 === 0 ? "hook" : "balanced";
      const options: Partial<FitOptions> = run % 3 === 0 ? { strategy } : { strategy, maxWords: 5, maxLines: 2, maxChars: 18 };
      const { cues } = expectInvariants(input, options);
      for (const chunk of cues) {
        const chunkWords = visibleWords([chunk]);
        const lone = chunkWords[0];
        if (chunkWords.length === 1 && lone && lone.text.replace(/[^\p{L}\p{N}]/gu, "").length <= 2) {
          const soloSources = input.filter((source) => visibleWords([source]).length === 1).map((source) => visibleWords([source])[0]?.text);
          expect(soloSources).toContain(lone.text);
        }
      }
    }
  });
});

describe("fitCues on long messy input", () => {
  const messy = (count: number): RawCue[] => {
    const random = mulberry32(42);
    return Array.from({ length: count }, (_, index) => {
      const words = Array.from({ length: 3 + Math.floor(random() * 18) }, (__, wordIndex) =>
        wordIndex % 5 === 2 ? `*${VOCABULARY[wordIndex % VOCABULARY.length] ?? "x"}*` : (VOCABULARY[(index + wordIndex) % VOCABULARY.length] ?? "x"),
      );
      const startMs = index * 2500 + Math.floor(random() * 900) - 300;
      return cue(index + 1, Math.max(0, startMs), Math.max(0, startMs) + 400 + Math.floor(random() * 4000), [words.join(" ")]);
    });
  };

  it("keeps every invariant on 300 overlapping run-on cues for both strategies", { timeout: 20000 }, () => {
    const input = messy(300);
    expectInvariants(input);
    expectInvariants(input, { strategy: "balanced" });
  });

  it("fits a few hundred cues in roughly linear time", () => {
    const small = messy(100);
    const large = messy(400);
    const time = (cues: RawCue[]) => {
      const started = performance.now();
      fitCues(cues);
      return performance.now() - started;
    };
    time(small);
    const smallMs = time(small);
    const largeMs = time(large);
    expect(largeMs).toBeLessThan(2000);
    expect(largeMs).toBeLessThan(Math.max(smallMs, 5) * 12);
  });
});
