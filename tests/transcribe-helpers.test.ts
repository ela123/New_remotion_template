import { describe, expect, it } from "vitest";
import { alignCueWords, normalizeWord, type WordTiming } from "../src/srt/align";
import { formatTimestamp } from "../src/srt/parse";
import {
  groupWordsIntoCues,
  isSpecialToken,
  mergeTokensToWords,
  type TokenInput,
} from "../scripts/lib/transcribe-helpers";

describe("transcribe-helpers: token to word merging", () => {
  it("identifies special tokens properly", () => {
    expect(isSpecialToken("[_BEG_]")).toBe(true);
    expect(isSpecialToken("[_NOTIMESTAMPS_]")).toBe(true);
    expect(isSpecialToken("[applause]")).toBe(true);
    expect(isSpecialToken(" hello")).toBe(false);
    expect(isSpecialToken("world")).toBe(false);
  });

  it("merges sub-word tokens and skips special tokens", () => {
    const tokens: TokenInput[] = [
      { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
      { text: " Hel", offsets: { from: 100, to: 300 } },
      { text: "lo", offsets: { from: 300, to: 500 } },
      { text: " world", offsets: { from: 600, to: 950 } },
      { text: "!", offsets: { from: 950, to: 1000 } },
      { text: "[_TT_100]", offsets: { from: 1000, to: 1000 } },
    ];

    const words = mergeTokensToWords(tokens);
    expect(words).toEqual([
      { text: "Hello", start: 0.1, end: 0.5 },
      { text: "world!", start: 0.6, end: 1.0 },
    ]);
  });

  it("handles leading token without space and drops empty whitespace words", () => {
    const tokens: TokenInput[] = [
      { text: "First", offsets: { from: 50, to: 200 } },
      { text: " ", offsets: { from: 200, to: 250 } },
      { text: "   ", offsets: { from: 250, to: 300 } },
      { text: " second", offsets: { from: 400, to: 600 } },
    ];

    const words = mergeTokensToWords(tokens);
    expect(words).toEqual([
      { text: "First", start: 0.05, end: 0.2 },
      { text: "second", start: 0.4, end: 0.6 },
    ]);
  });
});

describe("transcribe-helpers: cue grouping", () => {
  it("starts a new cue when max words (6) is reached", () => {
    const words: WordTiming[] = [
      { text: "one", start: 0.0, end: 0.2 },
      { text: "two", start: 0.2, end: 0.4 },
      { text: "three", start: 0.4, end: 0.6 },
      { text: "four", start: 0.6, end: 0.8 },
      { text: "five", start: 0.8, end: 1.0 },
      { text: "six", start: 1.0, end: 1.2 },
      { text: "seven", start: 1.2, end: 1.4 },
    ];

    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.lines).toEqual(["one two three four five six"]);
    expect(cues[0]?.startMs).toBe(0);
    expect(cues[0]?.endMs).toBe(1200);
    expect(cues[1]?.lines).toEqual(["seven"]);
    expect(cues[1]?.startMs).toBe(1200);
    expect(cues[1]?.endMs).toBe(1400);
  });

  it("starts a new cue when duration exceeds 3.0s", () => {
    const words: WordTiming[] = [
      { text: "Slowly", start: 0.0, end: 1.5 },
      { text: "speaking", start: 1.6, end: 2.9 },
      { text: "words", start: 3.0, end: 3.5 },
    ];

    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.lines).toEqual(["Slowly speaking"]);
    expect(cues[1]?.lines).toEqual(["words"]);
  });

  it("starts a new cue when gap between words exceeds 0.5s", () => {
    const words: WordTiming[] = [
      { text: "Hello", start: 0.0, end: 0.4 },
      { text: "there", start: 1.1, end: 1.5 }, // gap = 0.7s > 0.5s
    ];

    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.lines).toEqual(["Hello"]);
    expect(cues[1]?.lines).toEqual(["there"]);
  });

  it("starts a new cue after punctuation (. ! ? ; : ,)", () => {
    const words: WordTiming[] = [
      { text: "Wait,", start: 0.0, end: 0.3 },
      { text: "listen!", start: 0.4, end: 0.8 },
      { text: "Who's", start: 0.9, end: 1.1 },
      { text: "there?", start: 1.2, end: 1.5 },
      { text: "It's", start: 1.6, end: 1.8 },
      { text: "me.", start: 1.9, end: 2.1 },
      { text: "Done", start: 2.2, end: 2.4 },
    ];

    const cues = groupWordsIntoCues(words);
    expect(cues.map((c) => c.lines[0])).toEqual([
      "Wait,",
      "listen!",
      "Who's there?",
      "It's me.",
      "Done",
    ]);
  });
});

describe("SRT timestamp formatting", () => {
  it("formats zero and standard timestamps properly", () => {
    expect(formatTimestamp(0)).toBe("00:00:00,000");
    expect(formatTimestamp(1234)).toBe("00:00:01,234");
    expect(formatTimestamp(65432)).toBe("00:01:05,432");
    expect(formatTimestamp(3661005)).toBe("01:01:01,005");
  });
});

describe("Word timing alignment (analyze.ts)", () => {
  it("normalizes words by stripping non-alphanumeric and lowercasing", () => {
    expect(normalizeWord("Hello,")).toBe("hello");
    expect(normalizeWord("WORLD!!!")).toBe("world");
    expect(normalizeWord("don't")).toBe("dont");
    expect(normalizeWord("100%")).toBe("100");
  });

  it("aligns unedited words with exact timestamps from words.json", () => {
    const wordsJson: WordTiming[] = [
      { text: "Never", start: 1.12, end: 1.45 },
      { text: "give", start: 1.5, end: 1.78 },
      { text: "up", start: 1.82, end: 2.15 },
    ];

    const cursorRef = { index: 0 };
    const res = alignCueWords(
      {
        startMs: 1000,
        endMs: 2500,
        lines: [
          [
            { text: "Never", emphasis: false },
            { text: "give", emphasis: false },
            { text: "up", emphasis: false },
          ],
        ],
      },
      wordsJson,
      cursorRef,
    );

    expect(res.matchedCount).toBe(3);
    expect(res.interpolatedCount).toBe(0);
    const flat = res.timedLines.flat();
    expect(flat[0]).toMatchObject({ text: "Never", startMs: 1120, endMs: 1450 });
    expect(flat[1]).toMatchObject({ text: "give", startMs: 1500, endMs: 1780 });
    expect(flat[2]).toMatchObject({ text: "up", startMs: 1820, endMs: 2150 });
  });

  it("handles edited SRT: inserted word is interpolated between matched neighbours", () => {
    const wordsJson: WordTiming[] = [
      { text: "Never", start: 1.0, end: 1.4 },
      { text: "give", start: 1.8, end: 2.1 },
      { text: "up", start: 2.2, end: 2.6 },
    ];

    const cursorRef = { index: 0 };
    const res = alignCueWords(
      {
        startMs: 900,
        endMs: 2800,
        lines: [
          [
            { text: "Never", emphasis: false },
            { text: "EVER", emphasis: true }, // Inserted word
            { text: "give", emphasis: false },
            { text: "up", emphasis: false },
          ],
        ],
      },
      wordsJson,
      cursorRef,
    );

    expect(res.matchedCount).toBe(3);
    expect(res.interpolatedCount).toBe(1);

    const flat = res.timedLines.flat();
    expect(flat[0]).toMatchObject({ text: "Never", startMs: 1000, endMs: 1400 });
    // EVER interpolated between 1400 and 1800
    expect(flat[1]!.text).toBe("EVER");
    expect(flat[1]!.startMs).toBeGreaterThanOrEqual(1400);
    expect(flat[1]!.endMs).toBeLessThanOrEqual(1800);
    expect(flat[2]).toMatchObject({ text: "give", startMs: 1800, endMs: 2100 });
    expect(flat[3]).toMatchObject({ text: "up", startMs: 2200, endMs: 2600 });
  });

  it("handles edited SRT: typo fix / unmatched word stays inside cue boundaries", () => {
    const wordsJson: WordTiming[] = [
      { text: "receieved", start: 1.2, end: 1.6 },
      { text: "package", start: 1.7, end: 2.2 },
    ];

    const cursorRef = { index: 0 };
    const res = alignCueWords(
      {
        startMs: 1000,
        endMs: 2500,
        lines: [
          [
            { text: "received", emphasis: false }, // typo fixed in SRT
            { text: "package", emphasis: false },
          ],
        ],
      },
      wordsJson,
      cursorRef,
    );

    expect(res.matchedCount).toBe(1); // "package" matched
    expect(res.interpolatedCount).toBe(1); // "received" interpolated

    const flat = res.timedLines.flat();
    expect(flat[0]!.startMs).toBeGreaterThanOrEqual(1000);
    expect(flat[0]!.endMs).toBeLessThanOrEqual(1700);
    expect(flat[1]).toMatchObject({ text: "package", startMs: 1700, endMs: 2200 });
  });

  it("handles removed words in SRT by walking forward in wordsJson", () => {
    const wordsJson: WordTiming[] = [
      { text: "one", start: 0.1, end: 0.3 },
      { text: "and", start: 0.35, end: 0.45 }, // omitted in SRT
      { text: "two", start: 0.5, end: 0.7 },
    ];

    const cursorRef = { index: 0 };
    const res = alignCueWords(
      {
        startMs: 0,
        endMs: 1000,
        lines: [
          [
            { text: "one", emphasis: false },
            { text: "two", emphasis: false },
          ],
        ],
      },
      wordsJson,
      cursorRef,
    );

    expect(res.matchedCount).toBe(2);
    expect(res.interpolatedCount).toBe(0);
    const flat = res.timedLines.flat();
    expect(flat[0]).toMatchObject({ text: "one", startMs: 100, endMs: 300 });
    expect(flat[1]).toMatchObject({ text: "two", startMs: 500, endMs: 700 });
  });
});
