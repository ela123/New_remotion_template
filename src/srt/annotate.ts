import type { AnnotatedCue, RawCue } from "../types";
import { parseEmphasisLine } from "./parse";
import { estimateWordTimings } from "./timing";

export function annotateCue(cue: RawCue): AnnotatedCue {
  const parsedLines = cue.lines.map((line) => parseEmphasisLine(line).words).filter((words) => words.length > 0);
  const timedLines = estimateWordTimings(parsedLines, cue.startMs, cue.endMs);
  return {
    id: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    lines: timedLines.map((words) => ({ text: words.map((word) => word.text).join(" "), words })),
  };
}

export function annotateCues(cues: RawCue[]): AnnotatedCue[] {
  return cues.map(annotateCue).filter((cue) => cue.lines.length > 0);
}
