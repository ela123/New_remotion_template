import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path, { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { config } from "../src/intro.config";
import { splitInlineValues, wantsHelp } from "./lib/cli";
import { run } from "./lib/ffmpeg";
import { projectRoot } from "./lib/paths";
import { probeVideo } from "./lib/probe";
import { remotionCliPath } from "./lib/remotion";

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

const USAGE = `Usage: npm run batch -- [options]

Processes all supported videos (.mp4, .mov, .mkv, .webm) in input/ sequentially.
Options:
  --force              Re-render and overwrite existing outputs in out/
  --model <name>       Whisper model to use: tiny.en | base.en | small.en (default: small.en)
  --input-dir <path>   Directory containing source videos (default: input)
  --out-dir <path>     Directory for completed videos (default: out)
  --work-dir <path>    Base directory for isolated per-video workspaces (default: work)
  -h, --help           Show this help message`;

export type BatchOptions = {
  force: boolean;
  model: string;
  inputDir: string;
  outDir: string;
  workDir: string;
};

export function parseBatchArgs(argv: string[]): BatchOptions {
  const args = splitInlineValues(argv);
  const options: BatchOptions = {
    force: false,
    model: "small.en",
    inputDir: "input",
    outDir: "out",
    workDir: "work",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--force") {
      options.force = true;
    } else if (a === "--model") {
      options.model = args[++i] ?? "small.en";
    } else if (a === "--input-dir") {
      options.inputDir = args[++i] ?? "input";
    } else if (a === "--out-dir") {
      options.outDir = args[++i] ?? "out";
    } else if (a === "--work-dir") {
      options.workDir = args[++i] ?? "work";
    } else {
      console.error(`Unknown option: ${a}`);
      console.error(USAGE);
      process.exit(1);
    }
  }

  return options;
}

export function tsxCliPath(): string | null {
  try {
    const resolved = import.meta.resolve("tsx/cli");
    return fileURLToPath(resolved);
  } catch {
    try {
      const require = createRequire(import.meta.url);
      const pkgPath = require.resolve("tsx/package.json");
      return resolve(dirname(pkgPath), "dist", "cli.mjs");
    } catch {
      return null;
    }
  }
}

export function runChildProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; silent?: boolean } = {},
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: { ...process.env, ...options.env },
      stdio: options.silent ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stderrBuffer = "";
    if (options.silent && child.stderr) {
      child.stderr.on("data", (d) => { stderrBuffer += d.toString(); });
    }

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        const errDetail = stderrBuffer.trim();
        reject(new Error(errDetail || `Command "${path.basename(command)} ${args[0] ?? ""}" failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

export type VideoJob = {
  filename: string;
  inputPath: string;
  baseName: string;
  outputFilename: string;
  finalOutputPath: string;
};

export function findVideos(inputDir: string, outDir: string): VideoJob[] {
  if (!existsSync(inputDir)) {
    mkdirSync(inputDir, { recursive: true });
    return [];
  }

  const entries = readdirSync(inputDir);
  const jobs: VideoJob[] = [];

  for (const entry of entries) {
    const fullPath = path.resolve(inputDir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) continue;

    const ext = extname(entry).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      const baseName = path.basename(entry, extname(entry));
      const outputFilename = `${baseName}.mp4`;
      const finalOutputPath = path.resolve(outDir, outputFilename);
      jobs.push({
        filename: entry,
        inputPath: fullPath,
        baseName,
        outputFilename,
        finalOutputPath,
      });
    }
  }

  jobs.sort((a, b) => a.filename.localeCompare(b.filename));
  return jobs;
}

export function checkOutputCollisions(jobs: VideoJob[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const job of jobs) {
    const existing = map.get(job.outputFilename) ?? [];
    existing.push(job.filename);
    map.set(job.outputFilename, existing);
  }

  const collisions = new Map<string, string[]>();
  for (const [outName, inputs] of map.entries()) {
    if (inputs.length > 1) {
      collisions.set(outName, inputs);
    }
  }
  return collisions;
}

export async function prepareVideoFile(sourcePath: string, targetPath: string): Promise<void> {
  const ext = extname(sourcePath).toLowerCase();
  mkdirSync(dirname(targetPath), { recursive: true });

  if (ext === ".mp4") {
    copyFileSync(sourcePath, targetPath);
    return;
  }

  try {
    await run("ffmpeg", ["-y", "-i", sourcePath, "-c", "copy", targetPath]);
  } catch {
    await run("ffmpeg", [
      "-y",
      "-i", sourcePath,
      "-c:v", "libx264",
      "-crf", "18",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      targetPath,
    ]);
  }
}

const lastFailureReason = new Map<string, string>();

export async function processVideo(
  job: VideoJob,
  index: number,
  total: number,
  options: BatchOptions,
  tools: { tsxCli: string; remotionCli?: string; bundleLocation?: string },
): Promise<"success" | "skipped" | "failed"> {
  const { filename, inputPath, baseName, finalOutputPath } = job;
  const targetVideoName = config.video ?? "intro.mp4";
  const label = `Rendering ${index + 1}/${total}: ${filename}`;
  const tempOutput = path.resolve(options.outDir, `.${baseName}.tmp.mp4`);

  // Check if output already exists with correct duration (±0.1s)
  if (existsSync(finalOutputPath) && !options.force) {
    if (!existsSync(inputPath)) {
      console.log(`${label} ... skipped (already exists)`);
      return "skipped";
    }

    let matchesDuration = true;
    try {
      const inProbe = await probeVideo(inputPath);
      const outProbe = await probeVideo(finalOutputPath);
      matchesDuration = Math.abs(outProbe.durationSec - inProbe.durationSec) <= 0.1;
    } catch {
      matchesDuration = false;
    }

    if (matchesDuration) {
      console.log(`${label} ... skipped (already exists)`);
      return "skipped";
    }
  }

  process.stdout.write(`${label} ... `);
  const startTime = Date.now();

  const videoWorkDir = path.resolve(options.workDir, baseName);
  mkdirSync(videoWorkDir, { recursive: true });
  mkdirSync(options.outDir, { recursive: true });

  try {
    // 1. Prepare video file in isolated workspace
    const isolatedVideoPath = path.resolve(videoWorkDir, targetVideoName);
    await prepareVideoFile(inputPath, isolatedVideoPath);

    // 2. Transcribe
    const transcribeScript = path.resolve(projectRoot, "scripts", "transcribe.ts");
    await runChildProcess(process.execPath, [
      tools.tsxCli,
      transcribeScript,
      isolatedVideoPath,
      "--out-dir", videoWorkDir,
      "--model", options.model,
    ], { silent: true });

    // 3. Caption Analysis
    const captionsJsonPath = path.resolve(videoWorkDir, "captions.json");
    if (!existsSync(captionsJsonPath) || options.force) {
      const analyzeScript = path.resolve(projectRoot, "scripts", "analyze.ts");
      await runChildProcess(process.execPath, [
        tools.tsxCli,
        analyzeScript,
        "--out-dir", videoWorkDir,
      ], { silent: true });
    }

    if (!existsSync(captionsJsonPath)) {
      throw new Error("Caption analysis did not produce captions.json");
    }

    // 4. Render using single-video child process with Fallback ladder: 1.0 -> 0.75 -> 0.5
    const renderSingleScript = path.resolve(projectRoot, "scripts", "render-single.ts");
    const bundleDir = tools.bundleLocation ?? path.resolve(projectRoot, ".remotion-bundle");
    const scales = [1.0, 0.75, 0.5];
    let renderSuccess = false;
    let renderError = "";

    for (let s = 0; s < scales.length; s++) {
      const scale = scales[s]!;
      try {
        await runChildProcess(process.execPath, [
          "--max-old-space-size=3072",
          tools.tsxCli,
          renderSingleScript,
          "--bundle-dir", bundleDir,
          "--work-dir", videoWorkDir,
          "--input-path", isolatedVideoPath,
          "--output-path", finalOutputPath,
          "--scale", String(scale),
        ], { silent: true });

        if (existsSync(finalOutputPath)) {
          renderSuccess = true;
          break;
        }
      } catch (err) {
        renderError = err instanceof Error ? err.message : String(err);
        if (s < scales.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    if (!renderSuccess) {
      throw new Error(renderError || "Rendering failed across all scale attempts");
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;

    console.log(`done (${timeStr})`);
    return "success";
  } catch (err) {
    const reason = err instanceof Error ? err.message.split("\n")[0] ?? "Unknown error" : String(err);
    console.log(`failed (${reason})`);
    lastFailureReason.set(filename, reason);
    if (existsSync(tempOutput)) {
      try { rmSync(tempOutput, { force: true }); } catch { /* ignore */ }
    }
    return "failed";
  } finally {
    if (existsSync(tempOutput)) {
      try { rmSync(tempOutput, { force: true }); } catch { /* ignore */ }
    }
  }
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    console.log(USAGE);
    return;
  }

  const options = parseBatchArgs(argv);
  const inputDir = path.resolve(options.inputDir);
  const outDir = path.resolve(options.outDir);

  mkdirSync(inputDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const tsxCli = tsxCliPath();
  if (!tsxCli) {
    console.error("Could not find tsx CLI. Ensure dependencies are installed.");
    return;
  }

  const jobs = findVideos(inputDir, outDir);
  if (jobs.length === 0) {
    console.log(`No supported video files (.mp4, .mov, .mkv, .webm) found in ${inputDir}/.`);
    return;
  }

  const collisions = checkOutputCollisions(jobs);
  if (collisions.size > 0) {
    console.error("[ERROR] Output filename collision detected.");
    return;
  }

  // Pre-bundle Remotion once
  process.stdout.write("Bundling Remotion project once ... ");
  const bundleT0 = Date.now();
  let bundleLocation = "";
  try {
    bundleLocation = await bundle({
      entryPoint: path.resolve(projectRoot, "src", "index.ts"),
    });
    const bundleSec = Math.round((Date.now() - bundleT0) / 1000);
    console.log(`done (${bundleSec}s)`);
  } catch (err) {
    console.log(`failed to bundle: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const results: {
    filename: string;
    inputDuration: number;
    outputFilename: string;
    outputDuration: number;
    status: string;
    failureReason?: string;
  }[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    let inputDuration = 0;
    try {
      const probe = await probeVideo(job.inputPath);
      inputDuration = probe.durationSec;
    } catch {
      // ignore
    }

    const status = await processVideo(job, i, jobs.length, options, { tsxCli, bundleLocation });

    let outputDuration = 0;
    if (status === "success" || status === "skipped") {
      try {
        const outProbe = await probeVideo(job.finalOutputPath);
        outputDuration = outProbe.durationSec;
      } catch {
        // ignore
      }
    }

    results.push({
      filename: job.filename,
      inputDuration,
      outputFilename: job.outputFilename,
      outputDuration,
      status: status === "success" || status === "skipped" ? "Successful" : "Failed",
      failureReason: lastFailureReason.get(job.filename),
    });
  }

  console.log("\n==========================================================================================");
  console.log("input file | input duration | output file | output duration | status");
  console.log("------------------------------------------------------------------------------------------");
  for (const r of results) {
    console.log(`${r.filename} | ${r.inputDuration.toFixed(2)}s | ${r.outputFilename} | ${r.outputDuration.toFixed(2)}s | ${r.status}`);
  }
  console.log("==========================================================================================\n");

  const failedItems = results.filter((r) => r.status === "Failed");
  if (failedItems.length > 0) {
    console.log("Failed videos summary:");
    for (const f of failedItems) {
      console.log(` - ${f.filename}: ${f.failureReason ?? "Unknown error"}`);
    }
  }
}

if (process.argv[1]?.endsWith("batch.ts")) {
  main().catch(() => {
    // Script always exits with code 0 as requested in Task 6
    process.exit(0);
  });
}
