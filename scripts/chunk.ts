import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "../src/intro.config";
import { parseSrt } from "../src/srt/parse";
import { estimateWordTimings } from "../src/srt/timing";
import type { ChunkData, LineData, WordData } from "../src/types";
import { splitInlineValues, wantsHelp } from "./lib/cli";

const USAGE = `Usage: npm run chunk -- [options]

Splits SRT cues into Kinetic Typography chunks and lines automatically.
Supports manual overrides via chunks.override.json.

Options:
  --srt <path>        path to input SRT (default: public/${config.srt})
  --out <path>        path to output chunks JSON (default: public/chunks.json)
  --override <path>   path to manual override JSON (default: chunks.override.json)
  --max-words <n>     maximum words per line (default: 5)
  --max-lines <n>     maximum lines per chunk (default: 3)
  -h, --help          show this help message`;

type ChunkOptions = {
  srtPath: string;
  outputPath: string;
  overridePath: string;
  maxWordsPerLine: number;
  maxLinesPerChunk: number;
};

function parseArgs(argv: string[]): ChunkOptions {
  const args = splitInlineValues(argv);
  const opts: ChunkOptions = {
    srtPath: path.join("public", config.srt),
    outputPath: path.join("public", "chunks.json"),
    overridePath: "chunks.override.json",
    maxWordsPerLine: 5,
    maxLinesPerChunk: 3,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--srt") opts.srtPath = args[++i] ?? opts.srtPath;
    else if (arg === "--out") opts.outputPath = args[++i] ?? opts.outputPath;
    else if (arg === "--override") opts.overridePath = args[++i] ?? opts.overridePath;
    else if (arg === "--max-words") opts.maxWordsPerLine = parseInt(args[++i] ?? "5", 10);
    else if (arg === "--max-lines") opts.maxLinesPerChunk = parseInt(args[++i] ?? "3", 10);
  }
  return opts;
}

export function chunkSrtCues(
  rawCues: { id: number; startMs: number; endMs: number; lines: string[] }[],
  options: { maxWordsPerLine: number; maxLinesPerChunk: number; overrides?: ChunkData[] },
): ChunkData[] {
  const { maxWordsPerLine, maxLinesPerChunk, overrides } = options;

  if (overrides && overrides.length > 0) {
    return overrides;
  }

  const chunks: ChunkData[] = [];

  for (const cue of rawCues) {
    const parsedLineWords = cue.lines.map((l) =>
      l.split(/\s+/).filter(Boolean).map((w) => ({ text: w, emphasis: false })),
    );
    const timedLines = estimateWordTimings(parsedLineWords, cue.startMs, cue.endMs);
    const allWords = timedLines.flat();
    if (allWords.length === 0) continue;

    const maxWordsPerChunk = maxWordsPerLine * maxLinesPerChunk;
    const chunkCount = Math.max(1, Math.ceil(allWords.length / maxWordsPerChunk));
    const wordsPerChunk = Math.ceil(allWords.length / chunkCount);

    for (let c = 0; c < chunkCount; c++) {
      const sliceWords = allWords.slice(c * wordsPerChunk, (c + 1) * wordsPerChunk);
      if (sliceWords.length === 0) continue;

      const chunkStartMs = sliceWords[0]?.startMs ?? cue.startMs;
      const chunkEndMs = sliceWords[sliceWords.length - 1]?.endMs ?? cue.endMs;

      const lines: LineData[] = [];
      const lineCount = Math.max(1, Math.min(maxLinesPerChunk, Math.ceil(sliceWords.length / maxWordsPerLine)));
      const wordsPerLine = Math.ceil(sliceWords.length / lineCount);

      for (let l = 0; l < lineCount; l++) {
        const lineWordsRaw = sliceWords.slice(l * wordsPerLine, (l + 1) * wordsPerLine);
        if (lineWordsRaw.length === 0) continue;

        const words: WordData[] = lineWordsRaw.map((tw) => ({
          text: tw.text,
          start: tw.startMs / 1000,
          end: tw.endMs / 1000,
          role: "normal",
        }));

        lines.push({ words });
      }

      chunks.push({
        start: chunkStartMs / 1000,
        end: chunkEndMs / 1000,
        lines,
      });
    }
  }

  return chunks;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }

  const opts = parseArgs(argv);
  if (!existsSync(opts.srtPath)) {
    console.error(`SRT file not found: ${opts.srtPath}`);
    process.exit(1);
  }

  const srtContent = readFileSync(opts.srtPath, "utf8");
  const { cues, warnings } = parseSrt(srtContent, { offsetMs: config.srtOffsetMs });
  warnings.forEach((w) => console.warn(`[${w.code}] ${w.message}`));

  let overrides: ChunkData[] | undefined;
  if (existsSync(opts.overridePath)) {
    try {
      const overrideData = JSON.parse(readFileSync(opts.overridePath, "utf8"));
      if (Array.isArray(overrideData.chunks)) {
        overrides = overrideData.chunks;
        console.log(`Loaded manual chunk overrides from ${opts.overridePath}`);
      }
    } catch (e) {
      console.warn(`Could not read override file ${opts.overridePath}: ${e}`);
    }
  }

  const chunks = chunkSrtCues(cues, {
    maxWordsPerLine: opts.maxWordsPerLine,
    maxLinesPerChunk: opts.maxLinesPerChunk,
    overrides,
  });

  mkdirSync(path.dirname(path.resolve(opts.outputPath)), { recursive: true });
  writeFileSync(opts.outputPath, `${JSON.stringify({ chunks }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${chunks.length} chunks to ${opts.outputPath}`);
}

if (process.argv[1]?.endsWith("chunk.ts")) {
  main();
}
