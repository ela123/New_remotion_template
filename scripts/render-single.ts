import fs from "node:fs";
import path from "node:path";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { probeVideo } from "./lib/probe";

function parseArgs() {
  const args = process.argv.slice(2);
  let bundleDir = "";
  let workDir = "";
  let inputPath = "";
  let outputPath = "";
  let scale = 1.0;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--bundle-dir") bundleDir = args[++i] ?? "";
    else if (a === "--work-dir") workDir = args[++i] ?? "";
    else if (a === "--input-path") inputPath = args[++i] ?? "";
    else if (a === "--output-path") outputPath = args[++i] ?? "";
    else if (a === "--scale") scale = parseFloat(args[++i] ?? "1.0");
  }

  if (!bundleDir || !workDir || !inputPath || !outputPath) {
    throw new Error("Missing required arguments for render-single");
  }

  return { bundleDir: path.resolve(bundleDir), workDir: path.resolve(workDir), inputPath: path.resolve(inputPath), outputPath: path.resolve(outputPath), scale };
}

async function safeRename(src: string, dest: string, maxRetries = 10): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
      fs.renameSync(src, dest);
      return;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function main() {
  const { bundleDir, workDir, inputPath, outputPath, scale } = parseArgs();

  const probe = await probeVideo(inputPath);
  const realVideoDurationSeconds = probe.durationSec;
  const fps = probe.fps > 0 ? probe.fps : 30;
  const durationInFrames = Math.ceil(realVideoDurationSeconds * fps);

  // Synchronize assets into bundle's public folder and root public folder
  const bundlePublic = path.join(bundleDir, "public");
  fs.mkdirSync(bundlePublic, { recursive: true });
  fs.mkdirSync(path.resolve("public"), { recursive: true });

  const isolatedVideo = path.join(workDir, "intro.mp4");
  const videoSourceToUse = fs.existsSync(isolatedVideo) ? isolatedVideo : inputPath;

  const captionsJsonPath = path.join(workDir, "captions.json");
  const srtPath = path.join(workDir, "captions.srt");

  if (fs.existsSync(videoSourceToUse)) {
    fs.copyFileSync(videoSourceToUse, path.join(bundlePublic, "intro.mp4"));
    fs.copyFileSync(videoSourceToUse, path.resolve("public", "intro.mp4"));
  }
  if (fs.existsSync(captionsJsonPath)) {
    fs.copyFileSync(captionsJsonPath, path.join(bundlePublic, "captions.json"));
    fs.copyFileSync(captionsJsonPath, path.resolve("public", "captions.json"));
  }
  if (fs.existsSync(srtPath)) {
    fs.copyFileSync(srtPath, path.join(bundlePublic, "captions.srt"));
    fs.copyFileSync(srtPath, path.resolve("public", "captions.srt"));
  }

  let captionsDoc = null;
  if (fs.existsSync(captionsJsonPath)) {
    try {
      captionsDoc = JSON.parse(fs.readFileSync(captionsJsonPath, "utf8"));
    } catch {
      // ignore
    }
  }

  const inputProps = {
    quality: "final",
    style: "bold-energetic",
    durationInFrames,
    fps,
    width: probe.width,
    height: probe.height,
    videoDurationSec: realVideoDurationSeconds,
    captionsDoc,
  };

  const composition = await selectComposition({
    serveUrl: bundleDir,
    id: "LayeredCaption",
    inputProps,
    offthreadVideoCacheSizeInBytes: 384 * 1024 * 1024,
    timeoutInMilliseconds: 180000,
  });

  const outDir = path.dirname(outputPath);
  fs.mkdirSync(outDir, { recursive: true });

  // Use a unique temp file in work directory to avoid collision or lock issues
  const tempOutput = path.join(workDir, `tmp_render_${Date.now()}.mp4`);
  if (fs.existsSync(tempOutput)) {
    try { fs.unlinkSync(tempOutput); } catch { /* ignore */ }
  }

  await renderMedia({
    composition,
    serveUrl: bundleDir,
    codec: "h264",
    crf: 28,
    x264Preset: "veryfast",
    audioBitrate: "128k",
    concurrency: 1,
    imageFormat: "jpeg",
    jpegQuality: 85,
    offthreadVideoCacheSizeInBytes: 384 * 1024 * 1024,
    timeoutInMilliseconds: 180000,
    scale,
    outputLocation: tempOutput,
    inputProps,
    overwrite: true,
  });

  if (!fs.existsSync(tempOutput)) {
    throw new Error(`Render completed but output file not found at ${tempOutput}`);
  }

  // Atomically move to final destination
  await safeRename(tempOutput, outputPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
