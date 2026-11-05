import { mediaParserController, parseMedia, type MediaParserController } from "@remotion/media-parser";
import { staticFile } from "remotion";
import { config } from "../intro.config";
import { describeError, headOk, InputError } from "./errors";

export type VideoInfo = { width: number; height: number; fps: number; durationInSeconds: number };
export type ProxyInfo = { width: number; height: number; durationInSeconds: number | null };
export type ProxyStatus = { hasProxy: boolean; warning: string | null };

const ASPECT_TOLERANCE = 0.02;
const DURATION_TOLERANCE_SEC = 0.25;

async function withAbort<T>(signal: AbortSignal, task: (controller: MediaParserController) => Promise<T>): Promise<T> {
  const controller = mediaParserController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await task(controller);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function validateVideo(media: { dimensions: { width: number; height: number } | null; slowFps: number; slowDurationInSeconds: number }): VideoInfo {
  const file = `public/${config.video}`;
  if (!media.dimensions) throw new InputError(`${file} has no video track. Use an MP4 (H.264) file.`);
  const { slowFps: fps, slowDurationInSeconds: durationInSeconds } = media;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new InputError(`Could not detect the frame rate of ${file}. Run "npm run proxy" and use the CFR file it writes.`);
  }
  if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0) {
    throw new InputError(`${file} has no frames (duration ${durationInSeconds} s). Export the video again.`);
  }
  return { width: media.dimensions.width, height: media.dimensions.height, fps, durationInSeconds };
}

export async function readVideo(signal: AbortSignal): Promise<VideoInfo> {
  const src = staticFile(config.video);
  let media;
  try {
    media = await withAbort(signal, (controller) =>
      parseMedia({
        src,
        controller,
        fields: { dimensions: true, slowFps: true, slowDurationInSeconds: true },
        acknowledgeRemotionLicense: true,
      }),
    );
  } catch (err) {
    if (signal.aborted) throw err;
    if (!(await headOk(src, signal))) throw new InputError(`Put your video at public/${config.video} (or run "npm run sample" for a test clip)`);
    throw new InputError(`Could not read public/${config.video} (${describeError(err)}). Use an MP4 (H.264) file.`);
  }
  return validateVideo(media);
}

export function proxyMismatch(video: VideoInfo, proxy: ProxyInfo): string | null {
  const videoAspect = video.width / video.height;
  const proxyAspect = proxy.width / proxy.height;
  if (Math.abs(proxyAspect - videoAspect) / videoAspect > ASPECT_TOLERANCE) {
    return `is ${proxy.width}x${proxy.height}, which does not match the ${video.width}x${video.height} video`;
  }
  if (proxy.durationInSeconds !== null && Math.abs(proxy.durationInSeconds - video.durationInSeconds) > DURATION_TOLERANCE_SEC) {
    return `is ${proxy.durationInSeconds.toFixed(2)} s long but the video is ${video.durationInSeconds.toFixed(2)} s`;
  }
  return null;
}

const staleProxy = (reason: string): ProxyStatus => ({
  hasProxy: false,
  warning: `public/${config.proxyVideo} ${reason}; preview uses the original video. Run "npm run proxy" again.`,
});

export async function checkProxy(video: VideoInfo, signal: AbortSignal): Promise<ProxyStatus> {
  const src = staticFile(config.proxyVideo);
  if (!(await headOk(src, signal))) return { hasProxy: false, warning: null };
  try {
    const media = await withAbort(signal, (controller) =>
      parseMedia({ src, controller, fields: { dimensions: true, durationInSeconds: true }, acknowledgeRemotionLicense: true }),
    );
    if (!media.dimensions) return staleProxy("has no video track");
    const mismatch = proxyMismatch(video, { ...media.dimensions, durationInSeconds: media.durationInSeconds });
    return mismatch ? staleProxy(mismatch) : { hasProxy: true, warning: null };
  } catch (err) {
    if (signal.aborted) throw err;
    return staleProxy(`could not be read (${describeError(err)})`);
  }
}
