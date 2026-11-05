import { getRemotionEnvironment, type CalculateMetadataFunction } from "remotion";
import { config } from "../intro.config";
import { resolveActiveStyle } from "../template/active-style";
import { scheduleCues } from "../template/schedule";
import type { CaptionProps, SrtWarning } from "../types";
import { loadCues } from "./cues";
import { InputError } from "./errors";
import { checkProxy, readVideo, type VideoInfo } from "./media";

const FALLBACK = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 } as const;

const formatWarning = (w: SrtWarning): string => `[${w.code}] ${w.message}`;

export const calculateCaptionMetadata: CalculateMetadataFunction<CaptionProps> = async ({ props, abortSignal }) => {
  const warnings: string[] = [];
  try {
    const video = await readVideo(abortSignal);
    const fps = props.fps ?? video.fps ?? 30;
    const realVideoDurationSeconds = props.videoDurationSec ?? video.durationInSeconds;
    const durationInFrames = props.durationInFrames ?? Math.ceil(realVideoDurationSeconds * fps);
    const width = props.width ?? video.width;
    const height = props.height ?? video.height;

    const videoDurationMs = (durationInFrames / fps) * 1000;
    const { cues, captionsDoc, warnings: cueWarnings } = await loadCues(videoDurationMs, abortSignal);
    const styleName = props.style ?? config.style;
    const active = resolveActiveStyle({ ...config, style: styleName });
    if (active.warning) warnings.push(active.warning);
    const scheduled = scheduleCues(cues, active.recipe, fps);

    // TASK 2: Make reading-speed and min-display-extended messages quiet.
    // They are informational and must never fail the batch. Show at most one summary line like "Captions adjusted: 12 cues".
    const allWarnings = [...cueWarnings, ...scheduled.warnings];
    let adjustedCuesCount = 0;
    const filteredWarnings: string[] = [...warnings];
    for (const w of allWarnings) {
      if (w.code === "reading-speed" || w.code === "min-display-extended") {
        adjustedCuesCount++;
      } else {
        filteredWarnings.push(formatWarning(w));
      }
    }
    if (adjustedCuesCount > 0) {
      console.log(`Captions adjusted: ${adjustedCuesCount} cues`);
    }

    const proxy = props.quality === "final" ? { hasProxy: false, warning: null } : await checkProxy(video, abortSignal);
    if (proxy.warning) filteredWarnings.push(proxy.warning);
    filteredWarnings.forEach((w) => console.warn(w));

    return {
      width,
      height,
      fps,
      durationInFrames,
      props: {
        ...props,
        cues: props.cues && props.cues.length > 0 ? props.cues : cues,
        captionsDoc: props.captionsDoc ?? captionsDoc ?? null,
        style: styleName,
        safeMargin: props.safeMargin ?? config.layout.safeArea.x,
        offsetY: props.offsetY ?? config.layout.offsetY ?? 0,
        maxWordsPerLine: props.maxWordsPerLine ?? config.layout.maxWordsPerLine ?? 5,
        maxLinesPerChunk: props.maxLinesPerChunk ?? config.layout.maxLinesPerChunk ?? 3,
        error: null,
        warnings: filteredWarnings,
        hasProxy: proxy.hasProxy,
      },
    };
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    if (getRemotionEnvironment().isRendering) throw new Error(`${err.message.replace(/\.$/, "")}, then render again.`);
    return {
      ...FALLBACK,
      props: {
        ...props,
        cues: [],
        captionsDoc: null,
        error: err.message,
        warnings,
        hasProxy: false,
      },
    };
  }
};
