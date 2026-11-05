import type { RawCue, SrtWarning } from "../types";
import { formatTimestamp, parseEmphasisLine } from "./parse";

export type CheckOptions = { videoDurationMs?: number };

const CHECK_LIMITS = {
  minDurationMs: 400,
  maxDurationMs: 6000,
  maxLines: 3,
  maxLineChars: 28,
  maxCharsPerSecond: 20,
} as const;

function visibleLineText(line: string): string {
  return parseEmphasisLine(line)
    .words.map((word) => word.text)
    .join(" ");
}

function cueVisibleChars(cue: RawCue): number {
  return cue.lines.map(visibleLineText).join(" ").length;
}

function checkSingleCue(cue: RawCue, opts: CheckOptions): SrtWarning[] {
  const warnings: SrtWarning[] = [];
  const add = (code: SrtWarning["code"], message: string, line?: number) =>
    warnings.push({ code, message: `Cue ${cue.id}: ${message}`, cueId: cue.id, ...(line === undefined ? {} : { line }) });
  const durationMs = cue.endMs - cue.startMs;

  if (durationMs < CHECK_LIMITS.minDurationMs) {
    add("too-short", `lasts ${durationMs} ms (minimum ${CHECK_LIMITS.minDurationMs} ms); extend it or merge it with a neighbour`);
  }
  if (durationMs > CHECK_LIMITS.maxDurationMs) {
    add("too-long", `lasts ${(durationMs / 1000).toFixed(1)} s (maximum ${CHECK_LIMITS.maxDurationMs / 1000} s); split it or run srt:fit`);
  }
  if (cue.lines.length > CHECK_LIMITS.maxLines) {
    add("too-many-lines", `has ${cue.lines.length} lines (maximum ${CHECK_LIMITS.maxLines}); lines 4+ are merged into the last slot`);
  }
  cue.lines.forEach((line, index) => {
    const length = visibleLineText(line).length;
    if (length > CHECK_LIMITS.maxLineChars) {
      add("line-too-long", `line ${index + 1} has ${length} characters (maximum ${CHECK_LIMITS.maxLineChars})`, index + 1);
    }
    if (parseEmphasisLine(line).unbalanced) {
      add("unbalanced-marker", `line ${index + 1} has an unclosed *emphasis* marker; it ends at the end of the line`, index + 1);
    }
  });
  if (opts.videoDurationMs !== undefined && cue.endMs > opts.videoDurationMs) {
    add("beyond-video", `ends at ${formatTimestamp(cue.endMs)}, after the video ends at ${formatTimestamp(opts.videoDurationMs)}`);
  }
  const charsPerSecond = durationMs > 0 ? cueVisibleChars(cue) / (durationMs / 1000) : Infinity;
  if (charsPerSecond > CHECK_LIMITS.maxCharsPerSecond) {
    add("reading-speed", `reading speed ${charsPerSecond.toFixed(1)} chars/s (maximum ${CHECK_LIMITS.maxCharsPerSecond}); shorten the text or lengthen the cue`);
  }
  return warnings;
}

function checkOverlaps(cues: RawCue[]): SrtWarning[] {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  return sorted.flatMap((cue, index) =>
    sorted
      .slice(index + 1)
      .filter((later) => later.startMs < cue.endMs)
      .map((later) => ({
        code: "overlap" as const,
        message: `Cue ${cue.id}: overlaps cue ${later.id} by ${Math.min(cue.endMs, later.endMs) - later.startMs} ms; end it at or before ${formatTimestamp(later.startMs)}`,
        cueId: cue.id,
      })),
  );
}

export function checkCues(cues: RawCue[], opts: CheckOptions = {}): SrtWarning[] {
  return [...checkOverlaps(cues), ...cues.flatMap((cue) => checkSingleCue(cue, opts))];
}
