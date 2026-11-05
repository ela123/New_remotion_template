import React from "react";
import { directionalBlur } from "../motion/blur";
import { driftScale } from "../motion/drift";
import { glitchIntensity, glitchWindow, linePose, travelDistance, type PoseInput } from "../motion/pose";
import { scaleFrames } from "../motion/stagger";
import { fontFamilyCss } from "../styles/fonts";
import { extrusionCss, extrusionDepth, glowCss, joinShadows, SHADOW_REACH_U, shadowCss } from "../effects/shadows";
import { Glitch, GLITCH_FRAMES_30, glitchJitter } from "../effects/Glitch";
import { MotionBlurFilter } from "../effects/MotionBlurFilter";
import type { Align, AnnotatedLine, EmphasisSpec, LineRecipe, Quality, Recipe, SlotTypography } from "../types";
import type { ActiveEffects } from "./active-style";
import { lineText, type PlacedLine } from "./layout";
import type { LineSchedule } from "./schedule";
import { Word, type ShadowFor, type WordLook } from "./Word";

type CaptionLineProps = {
  layerId: string;
  frame: number;
  fps: number;
  unit: number;
  frameSize: { width: number; height: number };
  line: AnnotatedLine;
  placed: PlacedLine;
  schedule: LineSchedule;
  recipe: LineRecipe;
  settle: Recipe["settle"];
  typography: SlotTypography;
  emphasis: EmphasisSpec;
  effects: ActiveEffects;
  quality: Quality;
  zIndex: number;
  align: Align;
};

function shadowBuilder(effects: ActiveEffects, fontSize: number, unit: number, quality: Quality): ShadowFor {
  const lift = effects.depthLayer ? extrusionDepth(fontSize) : { x: 0, y: 0 };
  const soft = effects.shadow ? shadowCss(unit, quality, lift) : null;
  return (color, glow) =>
    joinShadows(
      effects.depthLayer ? extrusionCss(color, fontSize, quality) : null,
      soft,
      effects.glow ? glowCss(color, unit, quality, glow) : null,
    );
}

export const CaptionLine: React.FC<CaptionLineProps> = (props) => {
  const { layerId, frame, fps, unit, placed, schedule, recipe, typography, effects, quality } = props;
  const poseInput: PoseInput = {
    schedule,
    recipe,
    settle: props.settle,
    enterDistance: travelDistance(recipe.enter.distance, recipe.enter.from, placed, props.frameSize, unit),
    exitDistance: travelDistance(recipe.enter.distance, recipe.exit.to, placed, props.frameSize, unit),
    fps,
  };
  const pose = linePose(frame, poseInput);
  if (pose.opacity <= 0) return null;

  const id = `cue-${layerId}-${placed.slot}`;
  const blurOn = effects.motionBlur && recipe.motionBlur && !pose.resting;
  const prev = blurOn ? linePose(frame - 1, poseInput) : pose;
  const blur = blurOn
    ? directionalBlur({ x: prev.x / unit, y: prev.y / unit }, { x: pose.x / unit, y: pose.y / unit })
    : { x: 0, y: 0 };
  const blurring = blur.x > 0 || blur.y > 0;

  const glitch =
    effects.glitch && !pose.resting
      ? glitchIntensity(pose.entranceFrame, glitchWindow(schedule.enterFrames, scaleFrames(GLITCH_FRAMES_30, fps)))
      : 0;
  const glitchSeed = `${id}-${frame}`;
  const jitter = glitch > 0 ? glitchJitter(glitchSeed, unit, glitch) : 0;
  const drift = pose.resting ? driftScale(id, frame, fps, effects.drift) : 1;

  const shadowFor = shadowBuilder(effects, placed.fontSize, unit, quality);
  const look: WordLook = {
    color: typography.color,
    emphasis: props.emphasis,
    glowPulse: effects.glow && props.emphasis.glowPulse,
    shadowFor,
    unit,
    fontSize: placed.fontSize,
    baseline: placed.baseline,
    trackingEm: typography.trackingEm,
    align: props.align,
  };
  const text = lineText(props.line);
  const words = props.line.words.some((w) => w.emphasis) ? props.line.words : null;
  const tx = pose.resting ? Math.round(pose.x + jitter) : pose.x + jitter;
  const ty = pose.resting ? Math.round(pose.y) : pose.y;

  return (
    <>
      {blurring ? (
        <MotionBlurFilter
          id={`mb-${id}`}
          x={blur.x * unit}
          y={blur.y * unit}
          boxWidth={placed.width}
          boxHeight={placed.height}
          padPx={SHADOW_REACH_U * unit}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: placed.x,
          top: placed.y,
          width: placed.width,
          height: placed.height,
          zIndex: props.zIndex,
          whiteSpace: "pre",
          fontFamily: fontFamilyCss(typography.family),
          fontWeight: typography.weight,
          fontSize: placed.fontSize,
          lineHeight: placed.lineHeight,
          letterSpacing: `${typography.trackingEm}em`,
          textTransform: typography.uppercase ? "uppercase" : "none",
          color: typography.color,
          opacity: pose.opacity,
          transform: `translate(${tx}px, ${ty}px) scale(${pose.scale * drift})`,
          filter: blurring ? `url(#mb-${id})` : undefined,
        }}
      >
        {glitch > 0 ? (
          <Glitch seed={glitchSeed} unit={unit} intensity={glitch} quality={quality}>
            {text}
          </Glitch>
        ) : null}
        <div style={{ position: "relative", textShadow: shadowFor(typography.color, 1) }}>
          {words
            ? words.map((word, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? " " : null}
                  <Word word={word} index={i} count={words.length} frame={frame} fps={fps} look={look} />
                </React.Fragment>
              ))
            : text}
        </div>
      </div>
    </>
  );
};
