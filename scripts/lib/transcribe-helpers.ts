import type { RawCue } from "../../src/types";

export const MAX_WORDS_PER_CUE = 6;
export const MAX_DURATION_SEC_PER_CUE = 3.0;
export const MAX_WORD_GAP_SEC = 0.5;
export const CUE_BREAK_PUNCTUATION = /[.!?;:,]["'”’)\]]*$/;

export type WordTiming = {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
};

export type TokenInput = {
  text: string;
  offsets: {
    from: number; // in milliseconds
    to: number;   // in milliseconds
  };
};

export function isSpecialToken(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("[_") && trimmed.endsWith("_]")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/**
 * Merges sub-word tokens into whole words:
 * - A token starting with a space begins a new word.
 * - Otherwise appends to the previous word.
 * - Skips special tokens like `[_BEG_]`.
 * - Drops empty words.
 * - Timestamps in seconds.
 */
export function mergeTokensToWords(tokens: TokenInput[]): WordTiming[] {
  const words: WordTiming[] = [];
  let current: { text: string; startMs: number; endMs: number } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const trimmed = current.text.trim();
    if (trimmed.length > 0) {
      words.push({
        text: trimmed,
        start: Number((current.startMs / 1000).toFixed(3)),
        end: Number((current.endMs / 1000).toFixed(3)),
      });
    }
    current = null;
  };

  for (const token of tokens) {
    if (isSpecialToken(token.text)) {
      continue;
    }

    const startsWithSpace = token.text.startsWith(" ");
    if (startsWithSpace) {
      pushCurrent();
      current = {
        text: token.text.trimStart(),
        startMs: token.offsets.from,
        endMs: token.offsets.to,
      };
    } else {
      if (current === null) {
        current = {
          text: token.text.trimStart(),
          startMs: token.offsets.from,
          endMs: token.offsets.to,
        };
      } else {
        current.text += token.text;
        current.endMs = Math.max(current.endMs, token.offsets.to);
      }
    }
  }

  pushCurrent();
  return words;
}

export type CueGroupOptions = {
  maxWordsPerCue?: number;
  maxDurationSecPerCue?: number;
  maxWordGapSec?: number;
};

/**
 * Groups words into standard SRT cues following the cue rules:
 * - max 6 words per cue
 * - max 3.0 s per cue
 * - start a new cue if the gap between words > 0.5 s
 * - start a new cue after a word ending in . ! ? ; : ,
 */
export function groupWordsIntoCues(
  words: WordTiming[],
  options: CueGroupOptions = {},
): RawCue[] {
  const maxWords = options.maxWordsPerCue ?? MAX_WORDS_PER_CUE;
  const maxDuration = options.maxDurationSecPerCue ?? MAX_DURATION_SEC_PER_CUE;
  const maxGap = options.maxWordGapSec ?? MAX_WORD_GAP_SEC;

  const cues: RawCue[] = [];
  let currentWords: WordTiming[] = [];

  const flushCue = () => {
    if (currentWords.length === 0) return;
    const startMs = Math.round(currentWords[0]!.start * 1000);
    let endMs = Math.round(currentWords[currentWords.length - 1]!.end * 1000);
    if (endMs <= startMs) {
      endMs = startMs + 100;
    }
    cues.push({
      id: cues.length + 1,
      startMs,
      endMs,
      lines: [currentWords.map((w) => w.text).join(" ")],
    });
    currentWords = [];
  };

  for (const word of words) {
    if (currentWords.length === 0) {
      currentWords.push(word);
      continue;
    }

    const lastWord = currentWords[currentWords.length - 1]!;
    const cueStart = currentWords[0]!.start;

    const endedInPunctuation = CUE_BREAK_PUNCTUATION.test(lastWord.text);
    const gapExceeded = word.start - lastWord.end > maxGap;
    const wordsExceeded = currentWords.length >= maxWords;
    const durationExceeded = word.end - cueStart > maxDuration;

    if (endedInPunctuation || gapExceeded || wordsExceeded || durationExceeded) {
      flushCue();
    }

    currentWords.push(word);
  }

  flushCue();
  return cues;
}
