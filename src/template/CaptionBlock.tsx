import React from "react";
import type { Quality, StyleTokens } from "../types";
import { MotionGraphics } from "./MotionGraphics";
import { WordLayer } from "./WordLayer";
import type { ChunkLayout } from "./word-layout";

type CaptionBlockProps = {
  chunkLayout: ChunkLayout;
  frame: number;
  fps: number;
  unit: number;
  quality: Quality;
  style: StyleTokens;
  frameSize: { width: number; height: number };
  offsetY?: number;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const CaptionBlock: React.FC<CaptionBlockProps> = ({
  chunkLayout,
  frame,
  fps,
  unit,
  quality,
  style,
  frameSize,
  offsetY = 0,
}) => {
  const { startFrame, endFrame } = chunkLayout;

  // Don't render before startFrame or after endFrame (plus slight margin)
  if (frame < startFrame - 4 || frame > endFrame + 4) return null;

  // Slow camera push-in (1.00 to 1.06) across the whole chunk duration
  const chunkDuration = Math.max(1, endFrame - startFrame);
  const chunkProgress = clamp01((frame - startFrame) / chunkDuration);
  const textCameraScale = 1.0 + 0.06 * chunkProgress;
  const graphicsCameraScale = 1.0 + 0.03 * chunkProgress; // Small parallax!

  // Chunk Exit Animation (8 to 12 frames, default 10 frames)
  const exitFrames = 10;
  const exitStart = Math.max(startFrame + 5, endFrame - exitFrames);
  const isExiting = frame >= exitStart;
  const exitProgress = isExiting ? clamp01((frame - exitStart) / exitFrames) : 0;

  const originX = frameSize.width / 2;
  const originY = frameSize.height / 2 + offsetY;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {/* Motion Graphics Layer (Behind Text, Parallax Push-In) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${graphicsCameraScale})`,
          transformOrigin: `${originX}px ${originY}px`,
          zIndex: 1,
        }}
      >
        <MotionGraphics
          chunkLayout={chunkLayout}
          frame={frame}
          fps={fps}
          unit={unit}
          style={style}
          quality={quality}
        />
      </div>

      {/* Caption Text Layer (Word Layers, Parallax Push-In) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${textCameraScale})`,
          transformOrigin: `${originX}px ${originY}px`,
          zIndex: 2,
        }}
      >
        {chunkLayout.lines.map((line) =>
          line.words.map((word) => (
            <WordLayer
              key={`w-${word.lineIndex}-${word.wordIndexInLine}-${word.text}`}
              word={word}
              chunkStartFrame={startFrame}
              chunkEndFrame={endFrame}
              frame={frame}
              fps={fps}
              unit={unit}
              quality={quality}
              style={style}
              exitProgress={exitProgress}
              isExiting={isExiting}
            />
          )),
        )}
      </div>
    </div>
  );
};
