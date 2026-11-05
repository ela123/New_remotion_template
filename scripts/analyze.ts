import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/intro.config";
import { alignCueWords, type WordTiming } from "../src/srt/align";
import { parseSrt } from "../src/srt/parse";
import { estimateWordTimings } from "../src/srt/timing";
import type {
  CaptionsDoc,
  ChunkData,
  EmphasisEffect,
  EntranceType,
  LineData,
  WordData,
  WordRole,
} from "../src/types";
import { splitInlineValues, wantsHelp } from "./lib/cli";

const USAGE = `Usage: npm run analyze -- [options]

Auto-assigns word roles (hero | accent | normal | connector), entrance animations,
and emphasis effects using heuristics, and writes public/captions.json.

Options:
  --srt <path>         path to input SRT (default: public/${config.srt})
  --out <path>         path to output JSON (default: public/captions.json)
  --words-file <path>  path to words.json (default: public/words.json)
  --out-dir <path>     working directory containing SRT and words.json
  --words <n>          target words per line (default: 4)
  --lines <n>          target lines per chunk (default: 3)
  -h, --help           show this help`;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "you", "your",
  "i", "my", "we", "our", "it", "its", "that", "this", "me", "he", "she", "him", "her",
  "them", "us", "got", "how", "as",
]);

const KEY_HERO_WORDS = new Set([
  "success", "depended", "difference", "money", "broke", "hours", "day",
  "hear", "listen", "oprah", "winfrey", "buffett", "turner", "care", "make",
]);

const ENTRANCE_TYPES: EntranceType[] = [
  "scale-pop",
  "letter-stagger",
  "rotate-in",
  "mask-reveal",
  "slide-up",
  "blur-in",
  "tracking-collapse",
  "typewriter",
  "slice-reveal",
  "slide-left",
  "slide-right",
];

const EMPHASIS_EFFECTS: EmphasisEffect[] = [
  "count-up",
  "highlight-wipe",
  "underline-draw",
  "squiggle-draw",
  "impact-punch",
  "color-flash",
  "glow-pulse",
  "outline-fill",
  "strike-through",
  "float-breathe",
];

type WordAnalysis = {
  role: WordRole;
  effect: EmphasisEffect;
  entrance: EntranceType;
};

function analyzeWord(
  rawText: string,
  wordIndexInLine: number,
  totalWordsInLine: number,
  prevEntrance?: EntranceType,
  effectUsage: Map<EmphasisEffect, number> = new Map(),
): WordAnalysis {
  const clean = rawText.replace(/[^\w]/g, "");
  const lower = clean.toLowerCase();

  let role: WordRole = "normal";
  let effect: EmphasisEffect = "float-breathe";

  // Heuristic 1: Numbers & Digits
  if (/\d/.test(rawText)) {
    role = "hero";
    effect = "count-up";
  }
  // Heuristic 2: ALL CAPS words
  else if (clean.length >= 3 && clean === clean.toUpperCase()) {
    role = "hero";
    effect = "impact-punch";
  }
  // Heuristic 3: Key hero vocabulary
  else if (KEY_HERO_WORDS.has(lower)) {
    role = "hero";
    // Choose between highlight-wipe, impact-punch, glow-pulse, outline-fill
    const heroEffects: EmphasisEffect[] = ["highlight-wipe", "glow-pulse", "impact-punch", "outline-fill"];
    heroEffects.sort((a, b) => (effectUsage.get(a) ?? 0) - (effectUsage.get(b) ?? 0));
    effect = heroEffects[0] ?? "highlight-wipe";
  }
  // Heuristic 4: Connector words (stopwords, small filler words)
  else if (STOPWORDS.has(lower) && clean.length <= 4 && wordIndexInLine !== 0) {
    role = "connector";
    effect = "none";
  }
  // Heuristic 5: Long words or clause tail
  else if (clean.length >= 7 || (wordIndexInLine === totalWordsInLine - 1 && clean.length >= 5)) {
    role = "hero";
    const heroEffects: EmphasisEffect[] = ["highlight-wipe", "glow-pulse", "color-flash"];
    heroEffects.sort((a, b) => (effectUsage.get(a) ?? 0) - (effectUsage.get(b) ?? 0));
    effect = heroEffects[0] ?? "glow-pulse";
  }
  // Heuristic 6: Medium words (accent)
  else if (clean.length >= 5) {
    role = "accent";
    const accentEffects: EmphasisEffect[] = ["underline-draw", "squiggle-draw", "color-flash", "strike-through"];
    accentEffects.sort((a, b) => (effectUsage.get(a) ?? 0) - (effectUsage.get(b) ?? 0));
    effect = accentEffects[0] ?? "underline-draw";
  }
  // Heuristic 7: Normal rhythm words
  else {
    role = "normal";
    effect = "float-breathe";
  }

  effectUsage.set(effect, (effectUsage.get(effect) ?? 0) + 1);

  // Pick entrance ensuring neighboring words don't match
  const roleEntrances: EntranceType[] =
    role === "hero"
      ? ["scale-pop", "letter-stagger", "rotate-in", "mask-reveal"]
      : role === "accent"
        ? ["slide-up", "blur-in", "tracking-collapse", "mask-reveal"]
        : role === "connector"
          ? ["typewriter", "slice-reveal", "slide-up"]
          : ["mask-reveal", "slide-left", "slide-right", "slide-down", "blur-in"];

  let chosenEntrance = roleEntrances[wordIndexInLine % roleEntrances.length] ?? "mask-reveal";
  if (chosenEntrance === prevEntrance) {
    chosenEntrance = roleEntrances[(wordIndexInLine + 1) % roleEntrances.length] ?? "slide-up";
  }

  return { role, effect, entrance: chosenEntrance };
}

export function buildCaptionsDocument(
  rawCues: { id: number; startMs: number; endMs: number; lines: string[] }[],
  options: {
    maxWordsPerLine?: number;
    maxLinesPerChunk?: number;
    wordsJson?: WordTiming[];
    stats?: { matched: number; interpolated: number };
  } = {},
): CaptionsDoc {
  const maxWordsPerLine = options.maxWordsPerLine ?? 4;
  const maxLinesPerChunk = options.maxLinesPerChunk ?? 3;

  const effectUsage = new Map<EmphasisEffect, number>();
  const chunks: ChunkData[] = [];
  let prevEntrance: EntranceType | undefined;

  const cursorRef = { index: 0 };
  let totalMatched = 0;
  let totalInterpolated = 0;

  for (const cue of rawCues) {
    const parsedLineWords = cue.lines.map((l) =>
      l.split(/\s+/).filter(Boolean).map((w) => ({ text: w, emphasis: false })),
    );

    let timedLines;
    if (options.wordsJson && options.wordsJson.length > 0) {
      const alignRes = alignCueWords(
        { startMs: cue.startMs, endMs: cue.endMs, lines: parsedLineWords },
        options.wordsJson,
        cursorRef,
      );
      timedLines = alignRes.timedLines;
      totalMatched += alignRes.matchedCount;
      totalInterpolated += alignRes.interpolatedCount;
    } else {
      timedLines = estimateWordTimings(parsedLineWords, cue.startMs, cue.endMs);
    }

    const allWords = timedLines.flat();
    if (allWords.length === 0) continue;

    // Group into chunks of 1-3 lines
    const maxWordsPerChunk = maxWordsPerLine * maxLinesPerChunk;
    const chunkCount = Math.max(1, Math.ceil(allWords.length / maxWordsPerChunk));
    const wordsPerChunk = Math.ceil(allWords.length / chunkCount);

    for (let c = 0; c < chunkCount; c++) {
      const sliceWords = allWords.slice(c * wordsPerChunk, (c + 1) * wordsPerChunk);
      if (sliceWords.length === 0) continue;

      const chunkStart = (sliceWords[0]?.startMs ?? cue.startMs) / 1000;
      const chunkEnd = (sliceWords[sliceWords.length - 1]?.endMs ?? cue.endMs) / 1000;

      const lines: LineData[] = [];
      const lineCount = Math.max(1, Math.min(maxLinesPerChunk, Math.ceil(sliceWords.length / maxWordsPerLine)));
      const wordsPerLine = Math.ceil(sliceWords.length / lineCount);

      for (let l = 0; l < lineCount; l++) {
        const lineWordsRaw = sliceWords.slice(l * wordsPerLine, (l + 1) * wordsPerLine);
        if (lineWordsRaw.length === 0) continue;

        const words: WordData[] = lineWordsRaw.map((tw, wIdx) => {
          const { role, effect, entrance } = analyzeWord(
            tw.text,
            wIdx,
            lineWordsRaw.length,
            prevEntrance,
            effectUsage,
          );
          prevEntrance = entrance;

          return {
            text: tw.text,
            start: Number((tw.startMs / 1000).toFixed(3)),
            end: Number((tw.endMs / 1000).toFixed(3)),
            role,
            effect,
            entrance,
          };
        });

        lines.push({ words });
      }

      chunks.push({
        start: Number(chunkStart.toFixed(3)),
        end: Number(chunkEnd.toFixed(3)),
        lines,
      });
    }
  }

  if (options.stats) {
    options.stats.matched = totalMatched;
    options.stats.interpolated = totalInterpolated;
  }

  return { chunks };
}

export type AnalyzeOptions = {
  srtPath?: string;
  outPath?: string;
  wordsPath?: string;
  outDir?: string;
  wordsPerLine?: number;
  linesPerChunk?: number;
};

export function runAnalyze(options: AnalyzeOptions = {}): CaptionsDoc {
  const outDir = options.outDir;
  const srtPath = options.srtPath ?? (outDir ? path.join(outDir, config.srt) : path.join("public", config.srt));
  const outPath = options.outPath ?? (outDir ? path.join(outDir, "captions.json") : path.join("public", "captions.json"));
  const wordsPath = options.wordsPath ?? (outDir ? path.join(outDir, "words.json") : path.join("public", "words.json"));
  const wordsPerLine = options.wordsPerLine ?? 4;
  const linesPerChunk = options.linesPerChunk ?? 3;

  if (!existsSync(srtPath)) {
    console.error(`SRT file not found: ${srtPath}`);
    process.exit(1);
  }

  const srtContent = readFileSync(srtPath, "utf8");
  const { cues, warnings } = parseSrt(srtContent, { offsetMs: config.srtOffsetMs });
  for (const w of warnings) console.warn(`[${w.code}] ${w.message}`);

  let wordsJson: WordTiming[] | undefined;
  if (existsSync(wordsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(wordsPath, "utf8"));
      if (Array.isArray(parsed?.words)) {
        wordsJson = parsed.words;
      }
    } catch (e) {
      console.warn(`Could not parse words file ${wordsPath}: ${e}`);
    }
  }

  const stats = { matched: 0, interpolated: 0 };
  const doc = buildCaptionsDocument(cues, {
    maxWordsPerLine: wordsPerLine,
    maxLinesPerChunk: linesPerChunk,
    wordsJson,
    stats,
  });

  if (wordsJson) {
    console.log(`Aligned words with ${wordsPath}: ${stats.matched} matched, ${stats.interpolated} interpolated.`);
  } else {
    console.log("No words.json found; estimated word timings from SRT cue boundaries.");
  }

  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`Generated ${outPath} with ${doc.chunks.length} Kinetic Typography chunks.`);

  // Also write an example file if in public/
  if (!outDir) {
    const examplePath = path.join("public", "captions.example.json");
    writeFileSync(examplePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    console.log(`Wrote reference schema example to ${examplePath}`);
  }

  return doc;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }

  const args = splitInlineValues(argv);
  let srtPath: string | undefined;
  let outPath: string | undefined;
  let wordsPath: string | undefined;
  let outDir: string | undefined;
  let wordsPerLine = 4;
  let linesPerChunk = 3;

  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--srt") srtPath = args[++i];
    else if (a === "--out") outPath = args[++i];
    else if (a === "--words-file") wordsPath = args[++i];
    else if (a === "--out-dir" || a === "--work-dir") outDir = args[++i];
    else if (a === "--words") wordsPerLine = parseInt(args[++i] ?? "4", 10);
    else if (a === "--lines") linesPerChunk = parseInt(args[++i] ?? "3", 10);
  }

  runAnalyze({ srtPath, outPath, wordsPath, outDir, wordsPerLine, linesPerChunk });
}

if (process.argv[1]?.endsWith("analyze.ts")) {
  main();
}
