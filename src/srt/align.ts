import type { TimedWord } from "./timing";

export type WordTiming = {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
};

export type ParsedWord = {
  text: string;
  emphasis: boolean;
};

export type AlignResult = {
  timedLines: TimedWord[][];
  matchedCount: number;
  interpolatedCount: number;
};

export function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^\w]/g, "");
}

/**
 * Aligns words of a single SRT cue with word timings from words.json.
 * Walks through wordsJson in order using cursorRef.
 * Matched words receive exact timestamps from wordsJson (clamped to cue boundaries).
 * Unmatched words (e.g. inserted or edited words) are interpolated between matched neighbours.
 */
export function alignCueWords(
  cue: { startMs: number; endMs: number; lines: ParsedWord[][] },
  wordsJson: WordTiming[],
  cursorRef: { index: number },
): AlignResult {
  const allCueWords: ParsedWord[] = cue.lines.flat();
  if (allCueWords.length === 0) {
    return {
      timedLines: cue.lines.map(() => []),
      matchedCount: 0,
      interpolatedCount: 0,
    };
  }

  type Timing = { startMs: number; endMs: number };
  const matched: (Timing | null)[] = new Array(allCueWords.length).fill(null);

  // If cursor is lagging far behind cue start, advance it
  while (
    cursorRef.index < wordsJson.length &&
    (wordsJson[cursorRef.index]?.end ?? 0) * 1000 < cue.startMs - 2000
  ) {
    cursorRef.index++;
  }

  // 1. Normalized forward matching
  for (let i = 0; i < allCueWords.length; i++) {
    const rawWord = allCueWords[i]?.text ?? "";
    const targetNorm = normalizeWord(rawWord);
    if (!targetNorm) continue;

    const maxLookahead = Math.min(wordsJson.length, cursorRef.index + 25);
    let foundIndex = -1;

    for (let j = cursorRef.index; j < maxLookahead; j++) {
      const candidate = wordsJson[j];
      if (!candidate) continue;

      // Don't jump way ahead of this cue's timeframe
      if (candidate.start * 1000 > cue.endMs + 3000) {
        break;
      }

      if (normalizeWord(candidate.text) === targetNorm) {
        foundIndex = j;
        break;
      }
    }

    if (foundIndex !== -1) {
      const matchedWord = wordsJson[foundIndex]!;
      matched[i] = {
        startMs: Math.round(matchedWord.start * 1000),
        endMs: Math.round(matchedWord.end * 1000),
      };
      cursorRef.index = foundIndex + 1;
    }
  }

  let matchedCount = 0;
  for (const m of matched) {
    if (m !== null) matchedCount++;
  }
  const interpolatedCount = allCueWords.length - matchedCount;

  // 2. Interpolate unmatched words between nearest matched neighbours
  let idx = 0;
  while (idx < allCueWords.length) {
    if (matched[idx] !== null) {
      idx++;
      continue;
    }

    const runStart = idx;
    while (idx < allCueWords.length && matched[idx] === null) {
      idx++;
    }
    const runEnd = idx - 1; // inclusive [runStart, runEnd]

    const leftBoundaryMs = runStart === 0 ? cue.startMs : matched[runStart - 1]!.endMs;
    const rightBoundaryMs = runEnd === allCueWords.length - 1 ? cue.endMs : matched[runEnd + 1]!.startMs;

    let spanStart = Math.max(cue.startMs, Math.min(cue.endMs, leftBoundaryMs));
    let spanEnd = Math.max(cue.startMs, Math.min(cue.endMs, rightBoundaryMs));

    if (spanEnd <= spanStart) {
      spanEnd = Math.min(cue.endMs, spanStart + 50 * (runEnd - runStart + 1));
      if (spanEnd > cue.endMs) {
        spanStart = Math.max(cue.startMs, spanEnd - 50 * (runEnd - runStart + 1));
      }
    }

    const runWords = allCueWords.slice(runStart, runEnd + 1);
    const totalWeight = runWords.reduce((sum, w) => sum + (w.text.length + 1), 0);
    const span = Math.max(0, spanEnd - spanStart);

    let consumed = 0;
    for (let k = runStart; k <= runEnd; k++) {
      const w = allCueWords[k]!;
      const weight = w.text.length + 1;
      const wStart = spanStart + (span * consumed) / totalWeight;
      consumed += weight;
      const wEnd = k === runEnd ? spanEnd : spanStart + (span * consumed) / totalWeight;
      matched[k] = {
        startMs: Math.round(wStart),
        endMs: Math.round(wEnd),
      };
    }
  }

  // 3. Ensure strictly inside cue boundaries and non-decreasing
  for (let i = 0; i < allCueWords.length; i++) {
    const t = matched[i]!;
    let s = Math.max(cue.startMs, Math.min(cue.endMs, t.startMs));
    let e = Math.max(s, Math.min(cue.endMs, t.endMs));
    if (e <= s) {
      e = Math.min(cue.endMs, s + 30);
    }
    matched[i] = { startMs: s, endMs: e };
  }

  for (let i = 1; i < allCueWords.length; i++) {
    if (matched[i]!.startMs < matched[i - 1]!.startMs) {
      matched[i]!.startMs = matched[i - 1]!.startMs;
    }
    if (matched[i]!.endMs < matched[i]!.startMs) {
      matched[i]!.endMs = matched[i]!.startMs + 20;
    }
  }

  // 4. Reconstruct lines
  let wordIndex = 0;
  const timedLines: TimedWord[][] = cue.lines.map((line) =>
    line.map((w) => {
      const timing = matched[wordIndex++]!;
      return {
        text: w.text,
        emphasis: w.emphasis,
        startMs: timing.startMs,
        endMs: timing.endMs,
      };
    }),
  );

  return {
    timedLines,
    matchedCount,
    interpolatedCount,
  };
}
