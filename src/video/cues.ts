import { staticFile } from "remotion";
import { config } from "../intro.config";
import { annotateCues } from "../srt/annotate";
import { ANNOTATED_CUES_FILE } from "../srt/analyze";
import { checkCues } from "../srt/check";
import { parseSrt } from "../srt/parse";
import type { AnnotatedCue, CaptionsDoc, SrtWarning } from "../types";
import { InputError } from "./errors";

export type LoadedCues = {
  cues: AnnotatedCue[];
  captionsDoc?: CaptionsDoc | null;
  warnings: SrtWarning[];
};

export const CAPTIONS_JSON_FILE = "captions.json";

async function fetchText(file: string, missingMessage: string, signal: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(staticFile(file), { signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new InputError(missingMessage);
  }
  if (!res.ok) throw new InputError(missingMessage);
  return res.text();
}

async function tryFetchText(file: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(staticFile(file), { signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isWord = (value: unknown): boolean =>
  isRecord(value) && typeof value.text === "string" && typeof value.startMs === "number" && typeof value.endMs === "number";

const isLine = (value: unknown): boolean =>
  isRecord(value) && typeof value.text === "string" && Array.isArray(value.words) && value.words.every(isWord);

const isAnnotatedCue = (value: unknown): value is AnnotatedCue =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.startMs === "number" &&
  typeof value.endMs === "number" &&
  Array.isArray(value.lines) &&
  value.lines.every(isLine);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function docToCues(doc: CaptionsDoc, videoDurationMs?: number): AnnotatedCue[] {
  return doc.chunks.map((chunk, i) => {
    let startMs = Math.round(chunk.start * 1000);
    let endMs = Math.round(chunk.end * 1000);
    if (videoDurationMs !== undefined) {
      startMs = Math.min(startMs, videoDurationMs);
      endMs = Math.min(endMs, videoDurationMs);
    }
    return {
      id: i + 1,
      startMs,
      endMs,
      lines: chunk.lines.map((l) => ({
        text: l.words.map((w) => w.text).join(" "),
        words: l.words.map((w) => ({
          text: w.text,
          startMs: videoDurationMs !== undefined ? Math.min(Math.round(w.start * 1000), videoDurationMs) : Math.round(w.start * 1000),
          endMs: videoDurationMs !== undefined ? Math.min(Math.round(w.end * 1000), videoDurationMs) : Math.round(w.end * 1000),
          emphasis: w.role === "hero" || w.role === "accent",
        })),
      })),
    };
  });
}

async function loadJsonCues(videoDurationMs: number, signal: AbortSignal): Promise<LoadedCues> {
  // First check if captions.json exists
  const captionsText = await tryFetchText(CAPTIONS_JSON_FILE, signal);
  if (captionsText) {
    const data = parseJson(captionsText) as CaptionsDoc;
    if (data && Array.isArray(data.chunks) && data.chunks.length > 0) {
      if (videoDurationMs !== undefined) {
        for (const chunk of data.chunks) {
          chunk.start = Math.min(chunk.start, videoDurationMs / 1000);
          chunk.end = Math.min(chunk.end, videoDurationMs / 1000);
          for (const line of chunk.lines ?? []) {
            for (const word of line.words ?? []) {
              word.start = Math.min(word.start, videoDurationMs / 1000);
              word.end = Math.min(word.end, videoDurationMs / 1000);
            }
          }
        }
      }
      const cues = docToCues(data, videoDurationMs);
      const raw = cues.map((cue) => ({
        id: cue.id,
        startMs: cue.startMs,
        endMs: cue.endMs,
        lines: cue.lines.map((l) => l.text),
      }));
      return { cues, captionsDoc: data, warnings: checkCues(raw, { videoDurationMs }) };
    }
  }

  // Otherwise fallback to legacy annotated-cues.json
  const file = `public/${ANNOTATED_CUES_FILE}`;
  const text = await fetchText(
    ANNOTATED_CUES_FILE,
    `Run "npm run analyze" to create public/${CAPTIONS_JSON_FILE}, or set cueSource to "srt"`,
    signal,
  );
  const data = parseJson(text);
  if (!Array.isArray(data) || !data.every(isAnnotatedCue)) {
    throw new InputError(`${file} is not a list of annotated cues. Run "npm run analyze" again.`);
  }
  if (data.length === 0) throw new InputError(`${file} has no cues. Check public/${config.srt} and run "npm run analyze" again.`);
  const raw = data.map((cue) => ({ id: cue.id, startMs: cue.startMs, endMs: cue.endMs, lines: cue.lines.map((l) => l.text) }));
  return { cues: data, captionsDoc: null, warnings: checkCues(raw, { videoDurationMs }) };
}

function noCuesMessage(parseWarnings: SrtWarning[]): string {
  const invalid = parseWarnings.filter((w) => w.code === "invalid-block");
  const first = invalid[0];
  const detail = first ? ` (${invalid.length} invalid block(s) skipped; first: ${first.message})` : "";
  return `public/${config.srt} has no valid captions${detail}. Fix it and check with "npm run srt:check"`;
}

async function loadSrtCues(videoDurationMs: number, signal: AbortSignal): Promise<LoadedCues> {
  // If captions.json is present, load it for rich word roles
  const captionsText = await tryFetchText(CAPTIONS_JSON_FILE, signal);
  if (captionsText) {
    const data = parseJson(captionsText) as CaptionsDoc;
    if (data && Array.isArray(data.chunks) && data.chunks.length > 0) {
      if (videoDurationMs !== undefined) {
        for (const chunk of data.chunks) {
          chunk.start = Math.min(chunk.start, videoDurationMs / 1000);
          chunk.end = Math.min(chunk.end, videoDurationMs / 1000);
          for (const line of chunk.lines ?? []) {
            for (const word of line.words ?? []) {
              word.start = Math.min(word.start, videoDurationMs / 1000);
              word.end = Math.min(word.end, videoDurationMs / 1000);
            }
          }
        }
      }
      const cues = docToCues(data, videoDurationMs);
      const raw = cues.map((cue) => ({
        id: cue.id,
        startMs: cue.startMs,
        endMs: cue.endMs,
        lines: cue.lines.map((l) => l.text),
      }));
      return { cues, captionsDoc: data, warnings: checkCues(raw, { videoDurationMs }) };
    }
  }

  const text = await fetchText(config.srt, `Put your captions at public/${config.srt}`, signal);
  const parsed = parseSrt(text, { offsetMs: config.srtOffsetMs });
  if (parsed.cues.length === 0) throw new InputError(noCuesMessage(parsed.warnings));
  const clampedCues = parsed.cues.map((c) => ({
    ...c,
    startMs: Math.min(c.startMs, videoDurationMs),
    endMs: Math.min(c.endMs, videoDurationMs),
  }));
  return {
    cues: annotateCues(clampedCues),
    captionsDoc: null,
    warnings: [...parsed.warnings, ...checkCues(parsed.cues, { videoDurationMs })],
  };
}

export function loadCues(videoDurationMs: number, signal: AbortSignal): Promise<LoadedCues> {
  return config.cueSource === "json" ? loadJsonCues(videoDurationMs, signal) : loadSrtCues(videoDurationMs, signal);
}
