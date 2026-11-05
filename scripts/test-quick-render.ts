import path from "node:path";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { probeVideo } from "./lib/probe";
import fs from "node:fs";

async function main() {
  const bundleLocation = "C:/Users/SAY_MY~1/AppData/Local/Temp/remotion-webpack-bundle-foE3CU";
  const workDir = path.resolve("work/video_1_matthew_mcconaughey_how_to_find_directio_intro");
  const videoFile = path.resolve(workDir, "intro.mp4");
  const captionsJsonPath = path.resolve(workDir, "captions.json");
  
  const probe = await probeVideo(videoFile);
  const fps = 30;
  const durationInFrames = Math.ceil(probe.durationSec * fps);
  const captionsDoc = JSON.parse(fs.readFileSync(captionsJsonPath, "utf8"));

  const inputProps = {
    quality: "final",
    style: "bold-energetic",
    durationInFrames,
    fps,
    width: probe.width,
    height: probe.height,
    captionsDoc,
  };

  console.log("Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "LayeredCaption",
    inputProps,
  });

  console.log("Rendering 30 test frames with jpeg format...");
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    crf: 28,
    x264Preset: "veryfast",
    audioBitrate: "128k",
    concurrency: 1,
    imageFormat: "jpeg",
    jpegQuality: 85,
    offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
    timeoutInMilliseconds: 120000,
    frameRange: [0, 30],
    outputLocation: path.resolve("out/test_30frames_jpeg.mp4"),
    inputProps,
    overwrite: true,
    onProgress: (p) => {
      if (p.renderedFrames % 10 === 0) {
        console.log(`Rendered ${p.renderedFrames}/30 frames (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      }
    },
  });
  console.log(`Rendered 30 frames in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
}

main().catch(console.error);
