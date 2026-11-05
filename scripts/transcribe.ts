import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";
import { config } from "../src/intro.config";
import { serializeSrt } from "../src/srt/parse";
import { splitInlineValues, wantsHelp } from "./lib/cli";
import { run } from "./lib/ffmpeg";
import { probeVideo } from "./lib/probe";
import {
  groupWordsIntoCues,
  MAX_DURATION_SEC_PER_CUE,
  MAX_WORD_GAP_SEC,
  MAX_WORDS_PER_CUE,
  mergeTokensToWords,
  type TokenInput,
} from "./lib/transcribe-helpers";

// Configurable cue grouping rules
export { MAX_WORDS_PER_CUE, MAX_DURATION_SEC_PER_CUE, MAX_WORD_GAP_SEC };

const WHISPER_VERSION = "1.5.5";
const VALID_MODELS = ["tiny.en", "tiny", "base.en", "base", "small.en", "small", "medium.en"] as const;
type SupportedModel = (typeof VALID_MODELS)[number];

const USAGE = `Usage: npm run transcribe -- [video-path] [options]

Transcribes audio from a video using local whisper.cpp and generates public/captions.srt and public/words.json.

Arguments:
  video-path          Path to source video. If given, copied to public/intro.mp4.
                      If omitted, uses existing public/intro.mp4.

Options:
  --model <name>      Whisper model to use: tiny.en | base.en | small.en (default: base.en)
  --out-dir <path>    Working / output directory for assets (default: public)
  --force             Overwrite existing public/captions.srt without asking
  -h, --help          Show this help message`;

export type TranscribeCliOptions = {
  videoArg?: string;
  model: SupportedModel;
  force: boolean;
  outDir?: string;
};

export function parseArgs(argv: string[]): TranscribeCliOptions {
  const args = splitInlineValues(argv);
  let videoArg: string | undefined;
  let model: SupportedModel = "base.en";
  let force = false;
  let outDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--model") {
      const val = args[++i] ?? "";
      if (!VALID_MODELS.includes(val as SupportedModel)) {
        console.error(`Invalid model "${val}". Allowed models: ${VALID_MODELS.join(", ")}`);
        process.exit(1);
      }
      model = val as SupportedModel;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--out-dir" || a === "--work-dir") {
      outDir = args[++i];
    } else if (!a.startsWith("--")) {
      if (!videoArg) {
        videoArg = a;
      } else {
        console.error(`Unexpected extra argument: ${a}`);
        process.exit(1);
      }
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }

  return { videoArg, model, force, outDir };
}

export async function runTranscribe(options: Partial<TranscribeCliOptions> = {}): Promise<void> {
  const model: SupportedModel = options.model ?? "base.en";
  const force = options.force ?? false;
  const videoArg = options.videoArg;
  const outDir = options.outDir;

  const publicDir = path.resolve(outDir ?? "public");
  mkdirSync(publicDir, { recursive: true });

  const targetVideoPath = path.resolve(publicDir, config.video ?? "intro.mp4");
  const srtPath = path.resolve(publicDir, config.srt ?? "captions.srt");
  const wordsJsonPath = path.resolve(publicDir, "words.json");

  // 1. Resolve source video
  if (videoArg) {
    const resolvedSource = path.resolve(videoArg);
    if (!existsSync(resolvedSource)) {
      console.error(`Source video not found: ${resolvedSource}`);
      console.error(USAGE);
      process.exit(1);
    }
    if (path.resolve(resolvedSource) !== path.resolve(targetVideoPath)) {
      console.log(`Copying video ${resolvedSource} -> ${targetVideoPath}`);
      copyFileSync(resolvedSource, targetVideoPath);
    }
  } else {
    if (!existsSync(targetVideoPath)) {
      console.error(`No video specified and default video not found: ${targetVideoPath}`);
      console.error(USAGE);
      process.exit(1);
    }
  }

  // Probe video duration
  const probe = await probeVideo(targetVideoPath);
  const totalDurationSec = probe.audioDurationSec ?? probe.durationSec;

  // Check cache: if words.json and captions.srt already exist and are valid, reuse
  if (existsSync(srtPath) && existsSync(wordsJsonPath) && !force) {
    try {
      const existingWords = JSON.parse(readFileSync(wordsJsonPath, "utf8")).words;
      if (Array.isArray(existingWords) && existingWords.length > 0) {
        const lastWord = existingWords[existingWords.length - 1];
        if (lastWord && lastWord.end >= totalDurationSec * 0.7) {
          console.log(`[Cache hit] Using existing transcription in ${publicDir}`);
          return;
        }
      }
    } catch {
      // invalid cache, re-transcribe
    }
  }

  // 3. Extract audio to temporary 16 kHz mono WAV
  const wavPath = path.resolve(publicDir, "tmp-audio.wav");

  try {
    console.log(`\nExtracting 16 kHz mono audio to ${wavPath}...`);
    await run("ffmpeg", ["-y", "-i", targetVideoPath, "-ar", "16000", "-ac", "1", wavPath]);

    // 4. Install whisper.cpp and download model
    const whisperFolder = path.resolve("whisper.cpp");
    console.log(`\nEnsuring whisper.cpp (v${WHISPER_VERSION}) is ready at ${whisperFolder}...`);
    await installWhisperCpp({
      to: whisperFolder,
      version: WHISPER_VERSION,
      printOutput: false,
    });

    console.log(`\nEnsuring whisper model (${model}) is downloaded...`);
    await downloadWhisperModel({
      model: model as WhisperModel,
      folder: whisperFolder,
      printOutput: false,
    });

    console.log(`\nTranscribing audio with whisper.cpp (${model})...`);

    const transcribeWithRetry = async (inputAudio: string) => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await transcribe({
            inputPath: inputAudio,
            whisperPath: whisperFolder,
            whisperCppVersion: WHISPER_VERSION,
            model: model as WhisperModel,
            tokenLevelTimestamps: true,
            language: "en",
            printOutput: false,
          });
        } catch (err) {
          lastErr = err;
          if (attempt === 1) {
            console.warn(`[Whisper] Transcription attempt 1 failed, retrying...`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      throw lastErr;
    };

    let allTokens: TokenInput[] = [];

    // Chunk audio in 30-60s chunks if video is long (e.g. > 60s)
    const CHUNK_DURATION_SEC = 45;
    if (totalDurationSec > 60) {
      const numChunks = Math.ceil(totalDurationSec / CHUNK_DURATION_SEC);
      console.log(`Processing audio in ${numChunks} chunks (${CHUNK_DURATION_SEC}s each)...`);

      for (let c = 0; c < numChunks; c++) {
        const startSec = c * CHUNK_DURATION_SEC;
        const durSec = Math.min(CHUNK_DURATION_SEC, totalDurationSec - startSec);
        const chunkWav = path.resolve(publicDir, `tmp-chunk-${c}.wav`);

        await run("ffmpeg", [
          "-y",
          "-ss", String(startSec),
          "-t", String(durSec),
          "-i", wavPath,
          chunkWav,
        ]);

        const chunkResult = await transcribeWithRetry(chunkWav);
        if (existsSync(chunkWav)) {
          try { rmSync(chunkWav, { force: true }); } catch { /* ignore */ }
        }

        const offsetMs = startSec * 1000;
        const chunkTokens: TokenInput[] = chunkResult.transcription.flatMap((item) =>
          (item.tokens ?? []).map((t) => ({
            text: t.text,
            offsets: { from: t.offsets.from + offsetMs, to: t.offsets.to + offsetMs },
          })),
        );
        allTokens.push(...chunkTokens);
      }
    } else {
      const transcriptionResult = await transcribeWithRetry(wavPath);
      toCaptions({ whisperCppOutput: transcriptionResult });
      allTokens = transcriptionResult.transcription.flatMap((item) =>
        (item.tokens ?? []).map((t) => ({
          text: t.text,
          offsets: { from: t.offsets.from, to: t.offsets.to },
        })),
      );
    }

    const words = mergeTokensToWords(allTokens);

    // Verify transcript covers full video
    if (words.length > 0) {
      const lastWord = words[words.length - 1];
      console.log(`Transcript: ${words.length} words. Last word ends at ${lastWord?.end.toFixed(1)}s (video is ${totalDurationSec.toFixed(1)}s).`);
    }

    // Write public/words.json
    writeFileSync(wordsJsonPath, `${JSON.stringify({ words }, null, 2)}\n`, "utf8");

    // Group words into SRT cues and write public/captions.srt
    const cues = groupWordsIntoCues(words);
    writeFileSync(srtPath, serializeSrt(cues), "utf8");

    console.log(`\n✓ Transcription complete!`);
    console.log(`  Cues:  ${cues.length}`);
    console.log(`  Words: ${words.length}`);

    console.log(`  Files written:`);
    console.log(`    - ${wordsJsonPath}`);
    console.log(`    - ${srtPath}`);
    console.log(`\nNext step: Review public/captions.srt, then run: npm run analyze\n`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nTranscription failed: ${msg}`);
    if (
      process.platform === "win32" &&
      (msg.includes("cmake") ||
        msg.includes("make") ||
        msg.includes("build") ||
        msg.includes("compiler") ||
        msg.includes("MSB") ||
        msg.includes("Visual Studio"))
    ) {
      console.error("\n[Hint] Whisper.cpp building requires Visual Studio Build Tools and CMake on Windows.");
      console.error("  1. Install Visual Studio Build Tools with 'Desktop development with C++':");
      console.error("     https://visualstudio.microsoft.com/visual-cpp-build-tools/");
      console.error("  2. Install CMake: winget install Kitware.CMake");
    }
    process.exit(1);
  } finally {
    if (existsSync(wavPath)) {
      try {
        rmSync(wavPath, { force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }
  const opts = parseArgs(argv);
  await runTranscribe(opts);
}

if (process.argv[1]?.endsWith("transcribe.ts")) {
  main();
}
