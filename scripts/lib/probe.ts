import { run } from "./ffmpeg";

export type VideoInfo = {
  width: number;
  height: number;
  rFrameRate: string;
  avgFrameRate: string;
  fps: number;
  durationSec: number;
  frameCount: number;
  hasAudio: boolean;
  audioDurationSec: number | null;
  comment: string;
};

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseRate(rate: string): number {
  const [numerator, denominator] = rate.split("/").map(Number);
  if (numerator === undefined || !Number.isFinite(numerator)) return 0;
  if (denominator === undefined) return numerator;
  return denominator > 0 ? numerator / denominator : 0;
}

export async function probeVideo(file: string): Promise<VideoInfo> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const data: unknown = JSON.parse(out.toString("utf8"));
  if (!isFields(data) || !Array.isArray(data.streams)) throw new Error(`ffprobe returned no streams for ${file}`);

  const streams = data.streams.filter(isFields);
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${file} has no video stream`);

  const audio = streams.find((s) => s.codec_type === "audio");
  const format = isFields(data.format) ? data.format : {};
  const rFrameRate = str(video.r_frame_rate);
  const avgFrameRate = str(video.avg_frame_rate);
  const fps = parseRate(avgFrameRate) || parseRate(rFrameRate);
  const durationSec = num(video.duration) || num(format.duration);

  return {
    width: num(video.width),
    height: num(video.height),
    rFrameRate,
    avgFrameRate,
    fps,
    durationSec,
    frameCount: num(video.nb_frames) || Math.round(durationSec * fps),
    hasAudio: audio !== undefined,
    audioDurationSec: audio ? num(audio.duration) || null : null,
    comment: isFields(format.tags) ? str(format.tags.comment) : "",
  };
}
