import React, { useMemo } from "react";
import { interpolate, interpolateColors, spring } from "remotion";
import { fontFamilyCss } from "../styles/fonts";
import type { Quality, StyleTokens } from "../types";
import type { PlacedWord } from "./word-layout";

type WordLayerProps = {
  word: PlacedWord;
  chunkStartFrame: number;
  chunkEndFrame: number;
  frame: number;
  fps: number;
  unit: number;
  quality: Quality;
  style: StyleTokens;
  exitProgress: number; // 0 to 1
  isExiting: boolean;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number): number => t * t * t;

function generateSquigglePath(width: number, h: number): string {
  const wl = 16;
  const count = Math.max(2, Math.ceil(width / wl));
  let d = `M 0,${h / 2}`;
  for (let i = 0; i < count; i++) {
    const xMid = i * wl + wl / 2;
    const yControl = i % 2 === 0 ? 0 : h;
    const xEnd = Math.min(width, (i + 1) * wl);
    const yEnd = h / 2;
    d += ` Q ${xMid},${yControl} ${xEnd},${yEnd}`;
    if (xEnd >= width) break;
  }
  return d;
}

export const WordLayer: React.FC<WordLayerProps> = ({
  word,
  chunkStartFrame,
  chunkEndFrame,
  frame,
  fps,
  unit,
  quality,
  style,
  exitProgress,
  isExiting,
}) => {
  // Staggered entrance timing across words in lines
  const staggerFrames = word.lineIndex * 2.5 + word.wordIndexInLine * 2.0;
  const enterStart = chunkStartFrame + staggerFrames;
  const enterDuration = 10;
  const rawEnterProg = clamp01((frame - enterStart) / enterDuration);
  const enterProg = easeOutCubic(rawEnterProg);

  // Spoken emphasis timing based on word SRT times
  const wordStartFrame = Math.round(word.start * fps);
  const wordEndFrame = Math.round(word.end * fps);
  const isSpoken = frame >= wordStartFrame - 1 && frame <= wordEndFrame + 4;
  const spokenDuration = Math.max(1, wordEndFrame - wordStartFrame);
  const spokenProg = clamp01((frame - wordStartFrame) / spokenDuration);

  // Don't render before entrance start (unless 2 frames anticipation)
  if (frame < enterStart - 2) return null;

  // -------------------------------------------------------------
  // ENTRANCE ANIMATION (3D Optics & Elastic Springs)
  // -------------------------------------------------------------
  let transform = "";
  let opacity = enterProg * word.opacity;
  let filter: string | undefined;
  let letterSpacing = `${word.trackingEm}em`;
  let clipPath: string | undefined;
  let isMaskReveal = false;

  switch (word.entrance) {
    case "mask-reveal":
      isMaskReveal = true;
      opacity = rawEnterProg > 0 ? word.opacity : 0;
      if (quality === "final" && rawEnterProg < 0.95) {
        const blurY = Math.round((1 - enterProg) * 6 * unit);
        if (blurY > 0) filter = `blur(0px ${blurY}px)`;
      }
      break;

    case "slide-up": {
      const ty = (1 - enterProg) * 38 * unit;
      transform = `translateY(${ty}px)`;
      if (quality === "final" && rawEnterProg < 0.8) {
        filter = `blur(0px ${Math.round((1 - enterProg) * 4 * unit)}px)`;
      }
      break;
    }
    case "slide-down": {
      const ty = -(1 - enterProg) * 38 * unit;
      transform = `translateY(${ty}px)`;
      break;
    }
    case "slide-left": {
      const tx = (1 - enterProg) * 48 * unit;
      transform = `translateX(${tx}px)`;
      break;
    }
    case "slide-right": {
      const tx = -(1 - enterProg) * 48 * unit;
      transform = `translateX(${tx}px)`;
      break;
    }
    case "scale-pop": {
      const t = Math.max(0, frame - enterStart);
      const spr = spring({ frame: t, fps, config: { damping: 12, stiffness: 190 } });
      const popScale = interpolate(spr, [0, 1], [0.12, 1.0]);
      const ant = frame < enterStart ? 0.93 : 1;
      transform = `scale(${popScale * ant})`;
      break;
    }
    case "blur-in": {
      const s = 0.88 + 0.12 * enterProg;
      const b = (1 - enterProg) * 8 * unit;
      transform = `scale(${s})`;
      if (quality === "final" && b > 0.5) filter = `blur(${Math.round(b)}px)`;
      break;
    }
    case "rotate-in": {
      // Sophisticated 3D tilt flip entrance
      const rotX = (1 - enterProg) * -32;
      const ty = (1 - enterProg) * 26 * unit;
      const s = 0.86 + 0.14 * enterProg;
      transform = `perspective(900px) rotateX(${rotX}deg) translateY(${ty}px) scale(${s})`;
      break;
    }
    case "tracking-collapse": {
      const currentTracking = word.trackingEm + (1 - enterProg) * 0.38;
      letterSpacing = `${currentTracking}em`;
      const s = 0.92 + 0.08 * enterProg;
      transform = `scale(${s})`;
      break;
    }
    case "typewriter": {
      const charCount = Math.ceil(enterProg * word.text.length);
      clipPath = `inset(0 ${(1 - charCount / word.text.length) * 100}% 0 0)`;
      break;
    }
    case "slice-reveal": {
      const p = enterProg * 100;
      clipPath = `polygon(0 0, ${p}% 0, ${Math.max(0, p - 12)}% 100%, 0 100%)`;
      break;
    }
    case "letter-stagger":
    default:
      break;
  }

  // -------------------------------------------------------------
  // EMPHASIS EFFECTS (when spoken)
  // -------------------------------------------------------------
  let textColor = word.color;
  let textShadow = "0 2px 4px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.7)";
  let additionalScale = 1.0;
  let outlineFill = false;
  let rgbGlitchActive = false;
  let highlightWipeActive = false;
  let underlineActive = false;
  let squiggleActive = false;
  let strikeActive = false;
  let displayedText = word.text;

  const accent = style.emphasis.accentColor;

  if (isSpoken) {
    switch (word.effect) {
      case "highlight-wipe":
        highlightWipeActive = true;
        // High-contrast dark text inside the radiant highlight pill
        if (spokenProg > 0.12) {
          textColor = "#08090C";
          textShadow = "0 1px 0 rgba(255,255,255,0.4)";
        }
        additionalScale = 1.05;
        break;

      case "underline-draw":
        underlineActive = true;
        additionalScale = 1.03;
        break;

      case "squiggle-draw":
        squiggleActive = true;
        additionalScale = 1.03;
        break;

      case "color-flash": {
        const flashProgress = clamp01((frame - wordStartFrame) / 7);
        textColor = interpolateColors(flashProgress, [0, 0.35, 1], ["#FFFFFF", accent, word.color]);
        textShadow = `0 0 ${16 * unit}px ${accent}, 0 4px 16px rgba(0,0,0,0.8)`;
        additionalScale = 1.04;
        break;
      }

      case "outline-fill":
        outlineFill = true;
        additionalScale = 1.04;
        break;

      case "strike-through":
        strikeActive = true;
        break;

      case "impact-punch": {
        const punchAge = frame - wordStartFrame;
        if (punchAge <= 1) {
          additionalScale = 0.93; // 1-frame squish
        } else if (punchAge <= 4) {
          additionalScale = 1.22; // explosive pop
        } else if (punchAge <= 8) {
          additionalScale = 1.12;
        } else {
          additionalScale = 1.05;
        }
        textShadow = `0 0 ${20 * unit}px ${accent}, 0 8px 30px rgba(0,0,0,0.8)`;
        break;
      }

      case "glitch-rgb":
        rgbGlitchActive = quality === "final";
        textColor = accent;
        additionalScale = 1.04;
        break;

      case "glow-pulse": {
        const pulse = Math.sin((frame - wordStartFrame) * 0.45);
        const glowRadius = Math.round((16 + pulse * 10) * unit);
        textShadow = `0 0 ${glowRadius}px ${accent}, 0 0 ${glowRadius * 2.2}px ${accent}88, 0 4px 16px rgba(0,0,0,0.9)`;
        textColor = "#FFFFFF";
        additionalScale = 1.06;
        break;
      }

      case "count-up": {
        const digits = word.text.match(/\d+/);
        if (digits) {
          const targetNum = parseInt(digits[0], 10);
          const currentCount = Math.round(spokenProg * targetNum);
          displayedText = word.text.replace(/\d+/, String(currentCount));
        }
        break;
      }

      case "float-breathe":
      default: {
        const floatY = Math.sin((frame - wordStartFrame) * 0.28) * 3.5 * unit;
        transform += ` translateY(${floatY}px)`;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // CHUNK EXIT ANIMATION
  // -------------------------------------------------------------
  if (isExiting) {
    const lineStagger = word.lineIndex * 0.12;
    const wordExitProg = clamp01((exitProgress - lineStagger) / 0.85);
    const exitEase = easeInCubic(wordExitProg);
    const exitY = -exitEase * 34 * unit;
    transform += ` translateY(${exitY}px)`;
    opacity *= 1 - exitEase;
    if (quality === "final" && exitEase > 0.3) {
      const exitBlur = Math.round(exitEase * 6 * unit);
      filter = filter ? `${filter} blur(0px ${exitBlur}px)` : `blur(0px ${exitBlur}px)`;
    }
  }

  // Common typography styles
  const fontCss = fontFamilyCss(word.fontFamily);
  const textTransform = word.uppercase ? "uppercase" : "none";
  const renderLetters = word.entrance === "letter-stagger";

  return (
    <div
      style={{
        position: "absolute",
        left: word.x,
        top: word.y,
        width: word.width,
        height: word.height,
        fontFamily: fontCss,
        fontSize: word.fontSize,
        fontWeight: word.fontWeight,
        fontStyle: word.fontStyle,
        letterSpacing,
        textTransform,
        opacity,
        filter,
        clipPath,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: word.role === "hero" ? 5 : word.role === "accent" ? 4 : 2,
      }}
    >
      {/* 1. Kinetic Highlighter Capsule Pill */}
      {highlightWipeActive ? (
        <div
          style={{
            position: "absolute",
            inset: `${-4 * unit}px ${-10 * unit}px`,
            background: `linear-gradient(135deg, ${accent} 0%, #FFA500 100%)`,
            borderRadius: 14 * unit,
            clipPath: `inset(0 ${(1 - Math.min(1, spokenProg * 2.6)) * 100}% 0 0 round ${14 * unit}px)`,
            boxShadow: `0 ${6 * unit}px ${24 * unit}px ${accent}99, 0 0 ${16 * unit}px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.6)`,
            border: "1px solid rgba(255, 255, 255, 0.45)",
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          {/* Glossy top specular sheen */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              background: "linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0) 100%)",
            }}
          />
        </div>
      ) : null}

      {/* 2. Main Typography Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          transform: `${transform} scale(${additionalScale})`,
          transformOrigin: "center center",
          color: outlineFill ? (spokenProg > 0.5 ? word.color : "transparent") : textColor,
          WebkitTextStroke: outlineFill ? `${Math.max(1.5, 2 * unit)}px ${accent}` : undefined,
          textShadow: rgbGlitchActive
            ? `-4px 0 #FF0055, 4px 0 #00F0FF, ${textShadow}`
            : textShadow,
          overflow: isMaskReveal ? "hidden" : "visible",
          height: isMaskReveal ? word.height : undefined,
          display: isMaskReveal ? "flex" : undefined,
          alignItems: isMaskReveal ? "flex-end" : undefined,
        }}
      >
        {isMaskReveal ? (
          <span
            style={{
              display: "inline-block",
              transform: `translateY(${(1 - enterProg) * 115}%)`,
            }}
          >
            {displayedText}
          </span>
        ) : renderLetters ? (
          displayedText.split("").map((char, ci) => {
            const letterStart = enterStart + ci * 1.4;
            const letterT = Math.max(0, frame - letterStart);
            const letterSpr = spring({
              frame: letterT,
              fps,
              config: { damping: 13, stiffness: 220 },
            });
            const charOpacity = frame >= letterStart ? 1 : 0;
            const hopY = (1 - clamp01(letterT / 8)) * -6 * unit;
            return (
              <span
                key={ci}
                style={{
                  display: "inline-block",
                  transform: `scale(${letterSpr}) translateY(${hopY}px)`,
                  opacity: charOpacity,
                  transformOrigin: "bottom center",
                }}
              >
                {char}
              </span>
            );
          })
        ) : (
          displayedText
        )}
      </div>

      {/* 3. Luminous Rounded Underline with Leading Spark */}
      {underlineActive ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: -4 * unit,
            height: Math.max(3.5, Math.round(5 * unit)),
            background: `linear-gradient(90deg, ${accent}66 0%, ${accent} 70%, #FFFFFF 100%)`,
            borderRadius: 999,
            width: `${Math.min(1, spokenProg * 2.8) * 100}%`,
            boxShadow: `0 2px 14px ${accent}, 0 0 4px #FFFFFF`,
            zIndex: 2,
          }}
        >
          {/* Glowing head spark */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translate(50%, -50%)",
              width: 7 * unit,
              height: 7 * unit,
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              boxShadow: `0 0 8px #FFFFFF, 0 0 16px ${accent}`,
            }}
          />
        </div>
      ) : null}

      {/* 4. Procedural Dynamic Squiggle Wave */}
      {squiggleActive ? (
        <svg
          width={word.width}
          height={12 * unit}
          style={{
            position: "absolute",
            left: 0,
            bottom: -8 * unit,
            overflow: "visible",
            zIndex: 2,
          }}
        >
          <path
            d={generateSquigglePath(word.width, 12 * unit)}
            fill="none"
            stroke={accent}
            strokeWidth={Math.max(2.5, 3.5 * unit)}
            strokeLinecap="round"
            strokeDasharray={word.width * 1.5}
            strokeDashoffset={(1 - Math.min(1, spokenProg * 2.6)) * word.width * 1.5}
            style={{
              filter: `drop-shadow(0 0 6px ${accent})`,
            }}
          />
        </svg>
      ) : null}

      {/* 5. Glowing Strike-Through */}
      {strikeActive ? (
        <div
          style={{
            position: "absolute",
            left: -4 * unit,
            top: "50%",
            height: Math.max(3, Math.round(4 * unit)),
            backgroundColor: "#FF0055",
            borderRadius: 2 * unit,
            width: `${Math.min(1, spokenProg * 2.5) * (word.width + 8 * unit)}px`,
            transform: "translateY(-50%)",
            boxShadow: "0 0 10px #FF0055, 0 0 4px #FFFFFF",
            zIndex: 3,
          }}
        />
      ) : null}
    </div>
  );
};
