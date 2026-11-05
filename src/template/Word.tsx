import type React from "react";
import { interpolateColors } from "remotion";
import { emphasisStart, emphasisState, popOriginX } from "../motion/emphasis";
import { msToFrames } from "../srt/timing";
import type { Align, AnnotatedWord, EmphasisSpec } from "../types";

export type ShadowFor = (color: string, glow: number) => string | undefined;

export type WordLook = {
  color: string;
  emphasis: EmphasisSpec;
  glowPulse: boolean;
  shadowFor: ShadowFor;
  unit: number;
  fontSize: number;
  baseline: number;
  trackingEm: number;
  align: Align;
};

const UNDERLINE = { offsetEm: 0.1, thicknessEm: 0.055, minThicknessU: 2 } as const;

type WordProps = { word: AnnotatedWord; index: number; count: number; frame: number; fps: number; look: WordLook };

export const Word: React.FC<WordProps> = ({ word, index, count, frame, fps, look }) => {
  if (!word.emphasis) return <span>{word.text}</span>;

  const { emphasis, unit, fontSize } = look;
  const state = emphasisState(frame - emphasisStart(msToFrames(word.startMs, fps), fps), fps, emphasis.pop);
  const color = interpolateColors(state.colorMix, [0, 1], [look.color, emphasis.accentColor]);
  const thickness = Math.max(UNDERLINE.minThicknessU * unit, Math.round(fontSize * UNDERLINE.thicknessEm));

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        color,
        transform: state.scale === 1 ? undefined : `scale(${state.scale})`,
        transformOrigin: `${popOriginX(index, count, look.align)}% ${look.baseline}px`,
        textShadow: look.shadowFor(color, look.glowPulse ? state.glow : 1),
      }}
    >
      {word.text}
      {emphasis.underline && state.underline > 0 ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: Math.round(look.baseline + fontSize * UNDERLINE.offsetEm),
            height: thickness,
            width: `calc(100% - ${look.trackingEm}em)`,
            background: emphasis.accentColor,
            transform: `scaleX(${state.underline})`,
            transformOrigin: "0 50%",
            boxShadow: `0 ${unit}px ${3 * unit}px rgba(0, 0, 0, 0.35)`,
          }}
        />
      ) : null}
    </span>
  );
};
