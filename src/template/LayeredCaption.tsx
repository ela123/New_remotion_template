import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  getRemotionEnvironment,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { config } from "../intro.config";
import { loadStyleFonts } from "../styles/fonts";
import { Grain } from "../effects/Grain";
import { Background } from "../video/Background";
import type { AnnotatedCue, CaptionProps, CaptionsDoc, ChunkData, StyleTokens, WordData, WordRole } from "../types";
import { resolveActiveStyle, resolveEffects } from "./active-style";
import { CaptionBlock } from "./CaptionBlock";
import { ErrorScreen } from "./ErrorScreen";
import { referenceUnit } from "./units";
import { WarningsBadge } from "./WarningsBadge";
import { computeChunkLayout, type ChunkLayout } from "./word-layout";

type FontState = { ready: boolean; error: string | null };

function useStyleFonts(style: StyleTokens): FontState {
  const [handle] = useState(() => delayRender(`Loading fonts for style "${style.name}"`));
  const [state, setState] = useState<FontState>({ ready: false, error: null });

  useEffect(() => {
    let active = true;
    loadStyleFonts(style)
      .then(() => {
        if (active) setState({ ready: true, error: null });
        continueRender(handle);
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        const message = `Could not load the fonts for style "${style.name}": ${reason}. Check your internet connection and the style's font settings.`;
        if (getRemotionEnvironment().isRendering) {
          cancelRender(new Error(message));
          return;
        }
        if (active) setState({ ready: false, error: message });
        continueRender(handle);
      });
    return () => {
      active = false;
    };
  }, [handle, style]);

  return state;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "you", "your",
  "i", "my", "we", "our", "it", "its", "that", "this", "me", "he", "she", "him", "her",
]);

function inferRole(wordText: string, indexInLine: number, totalInLine: number): WordRole {
  const clean = wordText.replace(/[^\w\s]/g, "");
  const lower = clean.toLowerCase();
  if (/\d/.test(wordText)) return "hero";
  if (clean.length >= 3 && clean === clean.toUpperCase()) return "hero";
  if (STOPWORDS.has(lower) && wordText.length <= 4 && indexInLine !== 0) return "connector";
  if (clean.length >= 7 || indexInLine === totalInLine - 1) return "hero";
  if (clean.length >= 5) return "accent";
  return "normal";
}

const HERO_EFFECTS = ["highlight-wipe", "glow-pulse", "impact-punch", "color-flash"];
const ACCENT_EFFECTS = ["underline-draw", "squiggle-draw", "underline-draw"];

function cuesToDoc(cues: AnnotatedCue[], maxWordsPerLine = 5, maxLinesPerChunk = 3): CaptionsDoc {
  const chunks: ChunkData[] = [];

  for (const cue of cues) {
    const rawWords = cue.lines.flatMap((l) => l.words);
    if (rawWords.length === 0) continue;

    const wordsPerLine = Math.min(maxWordsPerLine, Math.max(3, Math.ceil(rawWords.length / maxLinesPerChunk)));
    const lines: { words: WordData[] }[] = [];
    let currentLineWords: WordData[] = [];

    for (let i = 0; i < rawWords.length; i++) {
      const rw = rawWords[i];
      if (!rw) continue;
      const role = inferRole(rw.text, currentLineWords.length, wordsPerLine);
      const effect =
        role === "hero"
          ? (HERO_EFFECTS[i % HERO_EFFECTS.length] ?? "highlight-wipe")
          : role === "accent"
            ? (ACCENT_EFFECTS[i % ACCENT_EFFECTS.length] ?? "underline-draw")
            : "none";
      currentLineWords.push({
        text: rw.text,
        start: rw.startMs / 1000,
        end: rw.endMs / 1000,
        role,
        effect,
      });

      if (currentLineWords.length >= wordsPerLine || i === rawWords.length - 1) {
        lines.push({ words: currentLineWords });
        currentLineWords = [];
      }
    }

    chunks.push({
      start: cue.startMs / 1000,
      end: cue.endMs / 1000,
      lines,
    });
  }

  return { chunks };
}

const Captions: React.FC<CaptionProps> = ({
  quality,
  cues,
  captionsDoc,
  hasProxy,
  warnings,
  style: styleProp,
  safeMargin = 0.08,
  offsetY = 0,
  maxWordsPerLine = 5,
  maxLinesPerChunk = 3,
  videoSrc,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const unit = referenceUnit(width, height);

  const active = useMemo(
    () => resolveActiveStyle({ ...config, style: styleProp ?? config.style }),
    [styleProp],
  );
  const fonts = useStyleFonts(active.style);
  const effects = useMemo(() => resolveEffects(active.style, quality), [active, quality]);
  const frameSize = useMemo(() => ({ width, height }), [width, height]);

  // Convert cues to document if captionsDoc is not directly provided
  const doc: CaptionsDoc = useMemo(() => {
    if (captionsDoc && captionsDoc.chunks && captionsDoc.chunks.length > 0) {
      return captionsDoc;
    }
    return cuesToDoc(cues, maxWordsPerLine, maxLinesPerChunk);
  }, [captionsDoc, cues, maxWordsPerLine, maxLinesPerChunk]);

  // Pre-compute the final layout of every chunk (words measured and positioned in resting slots)
  const chunkLayouts = useMemo((): ChunkLayout[] | null => {
    if (!fonts.ready) return null;
    return doc.chunks.map((chunk) =>
      computeChunkLayout(chunk, active.style, frameSize, {
        safeMargin,
        offsetY,
        unit,
        fps,
      }),
    );
  }, [fonts.ready, doc, active.style, frameSize, safeMargin, offsetY, unit, fps]);

  if (fonts.error) return <ErrorScreen message={fonts.error} warnings={warnings} />;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000000" }}>
      <Background quality={quality} hasProxy={hasProxy} videoSrc={videoSrc} />

      {/* Subtle Cinematic Ambient Lighting Pool (improves mobile contrast on any background video) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center 52%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {chunkLayouts
        ? chunkLayouts.map((layout, i) => {
            // Render active chunks (with a 4-frame overlap margin for smooth cuts)
            if (frame < layout.startFrame - 4 || frame > layout.endFrame + 4) return null;
            return (
              <CaptionBlock
                key={`chunk-${i}-${layout.startFrame}`}
                chunkLayout={layout}
                frame={frame}
                fps={fps}
                unit={unit}
                quality={quality}
                style={active.style}
                frameSize={frameSize}
                offsetY={offsetY}
              />
            );
          })
        : null}

      {effects.grain ? <Grain quality={quality} /> : null}
      <WarningsBadge warnings={warnings} unit={unit} />
    </AbsoluteFill>
  );
};

export const LayeredCaption: React.FC<CaptionProps> = (props) =>
  props.error ? <ErrorScreen message={props.error} warnings={props.warnings} /> : <Captions {...props} />;
