import type { ParseResult, RawCue, SrtWarning } from "../types";

export type ParsedWord = { text: string; emphasis: boolean };

type Block = { startLine: number; lines: string[] };

const TIMESTAMP_LINE =
  /^\s*(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})(?:\s.*)?$/;

const INDEX_LINE = /^\s*\d+\s*$/;

const FORMAT_TAGS = /<\/?(?:i|b|u|s|font)(?:\s[^>]*)?>|\{\\[^}]*\}/gi;

export const stripFormatting = (line: string): string => line.replace(FORMAT_TAGS, "").trim();

function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  normalizeText(text)
    .split("\n")
    .forEach((line, index) => {
      if (line.trim() === "") {
        current = null;
        return;
      }
      if (current === null) {
        current = { startLine: index + 1, lines: [] };
        blocks.push(current);
      }
      current.lines.push(line);
    });
  return blocks;
}

function timestampToMs(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms.padEnd(3, "0"));
}

function parseTimestampLine(line: string): { startMs: number; endMs: number } | null {
  const match = TIMESTAMP_LINE.exec(line);
  if (!match) return null;
  const [, h1 = "", m1 = "", s1 = "", ms1 = "", h2 = "", m2 = "", s2 = "", ms2 = ""] = match;
  return { startMs: timestampToMs(h1, m1, s1, ms1), endMs: timestampToMs(h2, m2, s2, ms2) };
}

type BlockOutcome = { cue: RawCue } | { problem: string; line: number };

function parseBlock(block: Block, fallbackId: number, offsetMs: number): BlockOutcome {
  const [first = "", ...rest] = block.lines;
  const hasIndex = INDEX_LINE.test(first);
  const timingLine = hasIndex ? (rest[0] ?? "") : first;
  const timingLineNumber = block.startLine + (hasIndex ? 1 : 0);
  const textLines = (hasIndex ? rest.slice(1) : rest).map(stripFormatting).filter((line) => line !== "");

  const timing = parseTimestampLine(timingLine);
  if (!timing) {
    return { problem: `expected "HH:MM:SS,mmm --> HH:MM:SS,mmm" but found "${timingLine.trim()}"`, line: timingLineNumber };
  }
  if (timing.endMs <= timing.startMs) {
    return { problem: "end time is not after start time", line: timingLineNumber };
  }
  if (textLines.length === 0) {
    return { problem: "cue has no text lines", line: timingLineNumber };
  }
  const startMs = Math.max(0, timing.startMs + offsetMs);
  const endMs = Math.max(0, timing.endMs + offsetMs);
  if (endMs <= startMs) {
    return { problem: `srtOffsetMs ${offsetMs} moves the whole cue before 0`, line: timingLineNumber };
  }
  const id = hasIndex ? Number(first.trim()) : fallbackId;
  return { cue: { id, startMs, endMs, lines: textLines } };
}

export function parseSrt(text: string, opts: { offsetMs?: number } = {}): ParseResult {
  const offsetMs = opts.offsetMs ?? 0;
  const cues: RawCue[] = [];
  const warnings: SrtWarning[] = [];
  splitBlocks(text).forEach((block, index) => {
    const blockNumber = index + 1;
    const outcome = parseBlock(block, blockNumber, offsetMs);
    if ("cue" in outcome) {
      cues.push(outcome.cue);
      return;
    }
    warnings.push({
      code: "invalid-block",
      message: `Skipped SRT block ${blockNumber} (line ${outcome.line}): ${outcome.problem}`,
      line: outcome.line,
    });
  });
  return { cues, warnings };
}

export function parseEmphasisLine(line: string): { words: ParsedWord[]; unbalanced: boolean } {
  const words: ParsedWord[] = [];
  let open = false;
  let text = "";
  let emphasis = false;

  const flushWord = () => {
    if (text !== "") words.push({ text, emphasis });
    text = "";
    emphasis = false;
  };

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    if (char === "\\" && line[i + 1] === "*") {
      text += "*";
      emphasis ||= open;
      i++;
    } else if (char === "*") {
      open = !open;
    } else if (/\s/.test(char)) {
      flushWord();
    } else {
      text += char;
      emphasis ||= open;
    }
  }
  flushWord();
  return { words, unbalanced: open };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(total % 1000, 3)}`;
}

export function serializeSrt(cues: RawCue[]): string {
  return cues
    .map((cue) => [String(cue.id), `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`, ...cue.lines].join("\n"))
    .map((block) => `${block}\n`)
    .join("\n");
}
