import type { RawCue, SrtWarning } from "../types";
import { annotateCue } from "./annotate";

export type FitOptions = {
  maxLines: number;
  maxChars: number;
  maxWords: number;
  minDur: number;
  maxDur: number;
  cps: number;
  strategy: "hook" | "balanced";
};

export const DEFAULT_FIT_OPTIONS: FitOptions = {
  maxLines: 3,
  maxChars: 22,
  maxWords: 7,
  minDur: 0.8,
  maxDur: 4,
  cps: 17,
  strategy: "hook",
};

export const HOOK_LINE_LIMITS: readonly [number, number, number] = [12, 22, 28];

export type FitSummary = { inputCues: number; outputChunks: number; avgCharsPerLine: number; warnings: SrtWarning[] };

type FitWord = { text: string; emphasis: boolean; startMs: number; endMs: number; soloSource: boolean };
type Chunk = { words: FitWord[]; lines: FitWord[][] };
type TimedChunk = Chunk & { startMs: number; endMs: number };

const CONJUNCTIONS = new Set(["and", "but", "so", "because", "or"]);
const SENTENCE_END = /[.?!…]["'”’)\]]*$/;
const CLAUSE_END = /[,;:—–]["'”’)\]]*$/;
const PAUSE_BREAK_MS = 300;
const MIN_TRIMMED_MS = 400;
const GAP_CLOSE_MS = 100;
const ORPHAN_PENALTY = 10_000;
const PAUSE_BREAK = 4;

function resolveFitOptions(opts: Partial<FitOptions> = {}): FitOptions {
  const defined = Object.fromEntries(Object.entries(opts).filter(([, value]) => value !== undefined));
  return { ...DEFAULT_FIT_OPTIONS, ...defined };
}

function textLength(words: FitWord[]): number {
  return words.map((word) => word.text).join(" ").length;
}

function bareWord(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

function isTinyWord(word: FitWord): boolean {
  return word.text.replace(/[^\p{L}\p{N}]/gu, "").length <= 2;
}

function isLoneTinyChunk(words: FitWord[], start: number, end: number): boolean {
  const word = words[start];
  return end - start === 1 && word !== undefined && isTinyWord(word) && !word.soloSource;
}

function flattenWords(cues: RawCue[]): FitWord[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  const words = sorted.flatMap((cue) => {
    const cueWords = annotateCue(cue).lines.flatMap((line) => line.words);
    return cueWords.map((word) => ({
      text: word.text,
      emphasis: word.emphasis === true,
      startMs: word.startMs,
      endMs: word.endMs,
      soloSource: cueWords.length === 1,
    }));
  });
  let floor = 0;
  return words.map((word) => {
    const startMs = Math.max(word.startMs, floor);
    floor = startMs;
    return { ...word, startMs, endMs: Math.max(word.endMs, startMs) };
  });
}

function splitsInto(words: FitWord[], count: number): FitWord[][][] {
  if (count <= 1) return words.length > 0 ? [[words]] : [];
  const splits: FitWord[][][] = [];
  for (let k = 1; k <= words.length - count + 1; k++) {
    for (const tail of splitsInto(words.slice(k), count - 1)) splits.push([words.slice(0, k), ...tail]);
  }
  return splits;
}

function cheapest(options: FitWord[][][], cost: (lines: FitWord[][]) => number): FitWord[][] | null {
  let best: FitWord[][] | null = null;
  let bestCost = Infinity;
  for (const lines of options) {
    const value = cost(lines);
    if (value < bestCost) {
      best = lines;
      bestCost = value;
    }
  }
  return best;
}

function withinLimits(lines: FitWord[][], limits: readonly number[]): boolean {
  return lines.every((line, index) => textLength(line) <= (limits[index] ?? 0));
}

function evennessCost(lines: FitWord[][]): number {
  const lengths = lines.map(textLength);
  const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  return lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0);
}

function hookLimitsFor(lines: FitWord[][]): readonly number[] {
  const [a, b, c] = HOOK_LINE_LIMITS;
  if (lines.length === 1) return [b];
  if (lines.length === 2) return lines[0]?.length === 1 ? [a, c] : [b, c];
  return HOOK_LINE_LIMITS;
}

function phraseSplitCost(rest: FitWord[]): (lines: FitWord[][]) => number {
  const target = Math.min(HOOK_LINE_LIMITS[1], Math.round(textLength(rest) * 0.4));
  return ([phrase = [], text = []]) => {
    const lastOfPhrase = phrase[phrase.length - 1];
    const firstOfText = text[0];
    const punctuationBonus = lastOfPhrase && (SENTENCE_END.test(lastOfPhrase.text) || CLAUSE_END.test(lastOfPhrase.text)) ? 4 : 0;
    const conjunctionBonus = firstOfText && CONJUNCTIONS.has(bareWord(firstOfText.text)) ? 2 : 0;
    return Math.abs(textLength(phrase) - target) - punctuationBonus - conjunctionBonus;
  };
}

function hookCandidates(words: FitWord[]): FitWord[][][] {
  const [first, ...rest] = words;
  if (!first) return [];
  if (rest.length === 0) return [[words]];
  const [, phraseLimit, textLimit] = HOOK_LINE_LIMITS;
  const phraseSplits = splitsInto(rest, 2).filter((split) => withinLimits(split, [phraseLimit, textLimit]));
  const bestPhrase = cheapest(phraseSplits, phraseSplitCost(rest));
  const threeLines = bestPhrase ? [[[first], ...bestPhrase]] : [];
  const twoLines = [[[first], rest]];
  const restIsShort = rest.length <= 2 || textLength(rest) <= HOOK_LINE_LIMITS[0];
  const phraseAndText = cheapest(
    splitsInto(words, 2).filter((split) => withinLimits(split, [phraseLimit, textLimit])),
    evennessCost,
  );
  return [
    ...(restIsShort ? [...twoLines, ...threeLines] : [...threeLines, ...twoLines]),
    [words],
    ...(phraseAndText ? [phraseAndText] : []),
  ];
}

function layoutHook(words: FitWord[], maxLines: number): FitWord[][] | null {
  return (
    hookCandidates(words).find((lines) => lines.length <= maxLines && withinLimits(lines, hookLimitsFor(lines))) ?? null
  );
}

type LineSplit = { cost: number; breaks: number[] };

function bestEvenSplit(words: FitWord[], count: number, maxChars: number): FitWord[][] | null {
  const mean = (textLength(words) - (count - 1)) / count;
  const lineCost = (from: number, to: number) => {
    const length = textLength(words.slice(from, to));
    return length > maxChars ? Infinity : (length - mean) ** 2;
  };
  let row: (LineSplit | null)[] = words.map((_, index) => {
    const cost = lineCost(0, index + 1);
    return Number.isFinite(cost) ? { cost, breaks: [] } : null;
  });
  for (let line = 2; line <= count; line++) {
    const previousRow = row;
    row = words.map((_, endIndex) => {
      let best: LineSplit | null = null;
      for (let split = line - 1; split <= endIndex; split++) {
        const before = previousRow[split - 1];
        if (!before) continue;
        const orphan = line === count && endIndex === words.length - 1 && split === endIndex && words.length > count;
        const cost = before.cost + lineCost(split, endIndex + 1) + (orphan ? ORPHAN_PENALTY : 0);
        if (Number.isFinite(cost) && (!best || cost < best.cost)) best = { cost, breaks: [...before.breaks, split] };
      }
      return best;
    });
  }
  const result = row[words.length - 1];
  if (!result) return null;
  const bounds = [0, ...result.breaks, words.length];
  return bounds.slice(1).map((end, index) => words.slice(bounds[index] ?? 0, end));
}

function layoutBalanced(words: FitWord[], maxLines: number, maxChars: number): FitWord[][] | null {
  for (let count = 1; count <= Math.min(maxLines, words.length); count++) {
    const best = bestEvenSplit(words, count, maxChars);
    if (best) return best;
  }
  return null;
}

function layoutChunk(words: FitWord[], opts: FitOptions): FitWord[][] | null {
  return opts.strategy === "hook" ? layoutHook(words, opts.maxLines) : layoutBalanced(words, opts.maxLines, opts.maxChars);
}

function sourceSpanMs(words: FitWord[]): number {
  const first = words[0];
  const last = words[words.length - 1];
  return first && last ? last.endMs - first.startMs : 0;
}

function chunkFits(words: FitWord[], opts: FitOptions, checkSpan = true): boolean {
  if (words.length > opts.maxWords) return false;
  if (checkSpan && words.length > 1 && sourceSpanMs(words) > opts.maxDur * 1000) return false;
  return layoutChunk(words, opts) !== null;
}

type WordStream = { words: FitWord[]; priorities: number[]; nextNaturalBreak: number[] };

function breakPriority(words: FitWord[], index: number): number {
  const previous = words[index - 1];
  const next = words[index];
  if (!previous || !next || next.startMs - previous.endMs >= PAUSE_BREAK_MS) return PAUSE_BREAK;
  if (SENTENCE_END.test(previous.text)) return 3;
  if (CLAUSE_END.test(previous.text)) return 2;
  if (CONJUNCTIONS.has(bareWord(next.text))) return 1;
  return 0;
}

function buildStream(words: FitWord[]): WordStream {
  const priorities = Array.from({ length: words.length + 1 }, (_, index) => breakPriority(words, index));
  const nextNaturalBreak = new Array<number>(words.length + 1).fill(words.length);
  for (let index = words.length - 1; index >= 0; index--) {
    const following = index + 1;
    nextNaturalBreak[index] = (priorities[following] ?? 0) >= 2 ? following : (nextNaturalBreak[following] ?? words.length);
  }
  return { words, priorities, nextNaturalBreak };
}

function priorityAt(stream: WordStream, index: number): number {
  return stream.priorities[index] ?? PAUSE_BREAK;
}

function strandsTinyWord(stream: WordStream, end: number): boolean {
  return isLoneTinyChunk(stream.words, end, end + 1) && priorityAt(stream, end + 1) === PAUSE_BREAK;
}

function balancedLimitBreak(stream: WordStream, start: number, candidates: number[]): number {
  const longest = Math.max(...candidates);
  const segmentLength = (stream.nextNaturalBreak[start] ?? stream.words.length) - start;
  const chunkCount = Math.ceil(segmentLength / (longest - start));
  const target = start + Math.ceil(segmentLength / chunkCount);
  return candidates.reduce((best, k) => (Math.abs(k - target) <= Math.abs(best - target) ? k : best));
}

function fittingEnds(stream: WordStream, start: number, opts: FitOptions, checkSpan: boolean): number[] {
  const ends: number[] = [];
  for (let end = start + 1; end <= Math.min(stream.words.length, start + opts.maxWords); end++) {
    if (chunkFits(stream.words.slice(start, end), opts, checkSpan)) ends.push(end);
  }
  return ends;
}

function chooseChunkEnd(stream: WordStream, start: number, opts: FitOptions): number {
  const { words } = stream;
  const fitting = fittingEnds(stream, start, opts, true);
  const acceptable = (end: number) => !isLoneTinyChunk(words, start, end) && !strandsTinyWord(stream, end);
  const valid = fitting.filter(acceptable);
  if (valid.length === 0) {
    const rescue = fittingEnds(stream, start, opts, false).find(acceptable);
    if (rescue !== undefined) return rescue;
  }
  const candidates = valid.length > 0 ? valid : fitting;
  if (candidates.length === 0) return start + 1;
  const topPriority = Math.max(...candidates.map((end) => priorityAt(stream, end)));
  const preferred = candidates.filter((end) => priorityAt(stream, end) === topPriority);
  if (topPriority === PAUSE_BREAK) return Math.min(...preferred);
  return topPriority > 0 ? Math.max(...preferred) : balancedLimitBreak(stream, start, preferred);
}

function chunkWords(words: FitWord[], opts: FitOptions, warnings: SrtWarning[]): Chunk[] {
  const stream = buildStream(words);
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < words.length) {
    const end = chooseChunkEnd(stream, start, opts);
    const chunkWordList = words.slice(start, end);
    const lines = layoutChunk(chunkWordList, opts);
    if (!lines) {
      warnings.push({
        code: "fit",
        message: `Chunk ${chunks.length + 1}: "${chunkWordList.map((word) => word.text).join(" ")}" does not fit the line limits; kept on one line`,
        cueId: chunks.length + 1,
      });
    }
    chunks.push({ words: chunkWordList, lines: lines ?? [chunkWordList] });
    start = end;
  }
  return chunks;
}

function readingTimeMs(chunk: Chunk, opts: FitOptions): number {
  return (textLength(chunk.words) / opts.cps) * 1000;
}

function planDurations(chunks: Chunk[], opts: FitOptions): TimedChunk[] {
  const minMs = opts.minDur * 1000;
  const maxMs = opts.maxDur * 1000;
  const starts = chunks.map((chunk) => Math.round(chunk.words[0]?.startMs ?? 0));
  return chunks.map((chunk, index) => {
    const startMs = starts[index] ?? 0;
    const nextStart = starts[index + 1] ?? Infinity;
    const sourceDuration = Math.round(sourceSpanMs(chunk.words));
    let duration = Math.max(1, Math.min(Math.max(sourceDuration, minMs), maxMs));
    const readingNeed = Math.min(readingTimeMs(chunk, opts), maxMs);
    if (readingNeed > duration) duration = Math.max(duration, Math.min(readingNeed, nextStart - startMs));
    return { ...chunk, startMs, endMs: Math.round(startMs + duration) };
  });
}

function removeOverlaps(chunks: TimedChunk[], opts: FitOptions, warnings: SrtWarning[]): TimedChunk[] {
  const resolved: TimedChunk[] = [];
  for (const chunk of chunks) {
    const previous = resolved[resolved.length - 1];
    if (!previous || chunk.startMs >= previous.endMs) {
      resolved.push({ ...chunk });
      continue;
    }
    if (chunk.startMs - previous.startMs >= MIN_TRIMMED_MS) {
      previous.endMs = chunk.startMs;
      if (previous.endMs - previous.startMs < opts.minDur * 1000) {
        warnings.push({
          code: "fit",
          message: `Chunk ${resolved.length}: shortened to ${previous.endMs - previous.startMs} ms (below min-dur) so it does not overlap the next chunk`,
          cueId: resolved.length,
        });
      }
      resolved.push({ ...chunk });
      continue;
    }
    const startMs = previous.endMs;
    resolved.push({ ...chunk, startMs, endMs: Math.max(chunk.endMs, startMs + Math.max(1, opts.minDur * 1000)) });
  }
  return resolved;
}

function closeSmallGaps(chunks: TimedChunk[]): TimedChunk[] {
  return chunks.map((chunk, index) => {
    const next = chunks[index + 1];
    const gap = next ? next.startMs - chunk.endMs : Infinity;
    return gap > 0 && gap < GAP_CLOSE_MS && next ? { ...chunk, endMs: next.startMs } : chunk;
  });
}

function escapeLiteralAsterisks(text: string): string {
  return text.replace(/\*/g, "\\*");
}

function serializeFitLine(words: FitWord[]): string {
  return words
    .map((word, index) => {
      const opens = word.emphasis && words[index - 1]?.emphasis !== true;
      const closes = word.emphasis && words[index + 1]?.emphasis !== true;
      return `${opens ? "*" : ""}${escapeLiteralAsterisks(word.text)}${closes ? "*" : ""}`;
    })
    .join(" ");
}

function averageCharsPerLine(chunks: Chunk[]): number {
  const lengths = chunks.flatMap((chunk) => chunk.lines.map(textLength));
  if (lengths.length === 0) return 0;
  return Math.round((lengths.reduce((sum, length) => sum + length, 0) / lengths.length) * 10) / 10;
}

export function fitCues(cues: RawCue[], opts: Partial<FitOptions> = {}): { cues: RawCue[]; summary: FitSummary } {
  const options = resolveFitOptions(opts);
  const warnings: SrtWarning[] = [];
  const chunks = chunkWords(flattenWords(cues), options, warnings);
  const timed = closeSmallGaps(removeOverlaps(planDurations(chunks, options), options, warnings));
  const output = timed.map((chunk, index) => ({
    id: index + 1,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    lines: chunk.lines.map(serializeFitLine),
  }));
  return {
    cues: output,
    summary: { inputCues: cues.length, outputChunks: output.length, avgCharsPerLine: averageCharsPerLine(chunks), warnings },
  };
}
