import type { ParsedWord } from "./parse";

export type TimedWord = { text: string; emphasis: boolean; startMs: number; endMs: number };

const PAUSE_PUNCTUATION = /[.,;:!?…—–]["'”’)\]]*$/;

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

function wordWeight(text: string): number {
  return text.length + 1 + (PAUSE_PUNCTUATION.test(text) ? 2 : 0);
}

export function estimateWordTimings(lines: ParsedWord[][], startMs: number, endMs: number): TimedWord[][] {
  const totalWeight = lines.flat().reduce((sum, word) => sum + wordWeight(word.text), 0);
  const span = endMs - startMs;
  let consumed = 0;
  const timeAt = (weight: number) => (weight >= totalWeight ? endMs : startMs + (span * weight) / totalWeight);

  return lines.map((line) =>
    line.map((word) => {
      const wordStart = timeAt(consumed);
      consumed += wordWeight(word.text);
      return { text: word.text, emphasis: word.emphasis, startMs: wordStart, endMs: timeAt(consumed) };
    }),
  );
}
