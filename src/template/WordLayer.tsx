import React, { useMemo } from "react";
import { interpolate, interpolateColors, random, spring } from "remotion";
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
  // Staggered entrance timing
  const staggerFrames = word.lineIndex * 3 + word.wordIndexInLine * 2.5;
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

  // Don't render before entrance start (unless 1-2 frames anticipation)
  if (frame < enterStart - 2) return null;

  // -------------------------------------------------------------
  // ENTRANCE ANIMATION
  // -------------------------------------------------------------
  let transform = "";
  let opacity = enterProg * word.opacity;
  let filter: string | undefined;
  let letterSpacing = `${word.trackingEm}em`;
  let clipPath: string | undefined;
  let isMaskReveal = false;

  const seed = `${word.text}-${word.globalIndex}`;

  switch (word.entrance) {
    case "mask-reveal":
      isMaskReveal = true;
      opacity = rawEnterProg > 0 ? word.opacity : 0;
      break;

    case "slide-up": {
      const ty = (1 - enterProg) * 36 * unit;
      transform = `translateY(${ty}px)`;
      break;
    }
    case "slide-down": {
      const ty = -(1 - enterProg) * 36 * unit;
      transform = `translateY(${ty}px)`;
      break;
    }
    case "slide-left": {
      const tx = (1 - enterProg) * 44 * unit;
      transform = `translateX(${tx}px)`;
      break;
    }
    case "slide-right": {
      const tx = -(1 - enterProg) * 44 * unit;
      transform = `translateX(${tx}px)`;
      break;
    }
    case "scale-pop": {
      // 2 frames anticipation
      const t = Math.max(0, frame - enterStart);
      const spr = spring({ frame: t, fps, config: { damping: 11, stiffness: 180 } });
      const popScale = interpolate(spr, [0, 1], [0.15, 1]);
      const ant = frame < enterStart ? 0.94 : 1;
      transform = `scale(${popScale * ant})`;
      break;
    }
    case "blur-in": {
      transform = `scale(${0.88 + 0.12 * enterProg})`;
      break;
    }
    case "rotate-in": {
      const rot = (1 - enterProg) * -7;
      const s = 0.85 + 0.15 * enterProg;
      transform = `rotate(${rot}deg) scale(${s})`;
      break;
    }
    case "tracking-collapse": {
      const currentTracking = word.trackingEm + (1 - enterProg) * 0.35;
      letterSpacing = `${currentTracking}em`;
      break;
    }
    case "typewriter": {
      // Reveals characters progressively
      const charCount = Math.ceil(enterProg * word.text.length);
      clipPath = `inset(0 ${(1 - charCount / word.text.length) * 100}% 0 0)`;
      break;
    }
    case "slice-reveal": {
      const p = enterProg * 100;
      clipPath = `polygon(0 0, ${p}% 0, ${Math.max(0, p - 15)}% 100%, 0 100%)`;
      break;
    }
    case "letter-stagger":
    default:
      // default spring
      break;
  }

  // -------------------------------------------------------------
  // EMPHASIS EFFECTS (when spoken)
  // -------------------------------------------------------------
  let textColor = word.color;
  let textShadow = "0 3px 12px rgba(0,0,0,0.65)";
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
        // Text turns high contrast black against bright highlight pill
        if (spokenProg > 0.15) {
          textColor = "#050505";
          textShadow = "none";
        }
        break;

      case "underline-draw":
        underlineActive = true;
        break;

      case "squiggle-draw":
        squiggleActive = true;
        break;

      case "color-flash": {
        const flashProgress = clamp01((frame - wordStartFrame) / 6);
        textColor = interpolateColors(flashProgress, [0, 0.4, 1], ["#FFFFFF", accent, word.color]);
        break;
      }

      case "outline-fill":
        outlineFill = true;
        break;

      case "strike-through":
        strikeActive = true;
        break;

      case "impact-punch": {
        const punchAge = frame - wordStartFrame;
        if (punchAge <= 1) {
          additionalScale = 0.94; // 1-2 frame anticipation
        } else if (punchAge <= 4) {
          additionalScale = 1.15; // impact punch
        } else if (punchAge <= 8) {
          additionalScale = 1.05;
        } else {
          additionalScale = 1.0;
        }
        break;
      }

      case "glitch-rgb":
        rgbGlitchActive = quality === "final";
        textColor = accent;
        break;

      case "glow-pulse": {
        const pulse = Math.sin((frame - wordStartFrame) * 0.45);
        const glowRadius = Math.round((14 + pulse * 8) * unit);
        textShadow = `0 0 ${glowRadius}px ${accent}, 0 0 ${glowRadius * 2}px ${accent}`;
        textColor = "#FFFFFF";
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
        const floatY = Math.sin((frame - wordStartFrame) * 0.25) * 3 * unit;
        transform += ` translateY(${floatY}px)`;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // CHUNK EXIT ANIMATION
  // -------------------------------------------------------------
  if (isExiting) {
    // Line exit staggered slightly (8-12 frames)
    const lineStagger = word.lineIndex * 0.12;
    const wordExitProg = clamp01((exitProgress - lineStagger) / 0.85);
    const exitEase = easeInCubic(wordExitProg);
    const exitY = -exitEase * 32 * unit;
    transform += ` translateY(${exitY}px)`;
    opacity *= 1 - exitEase;
  }

  // Common typography styles
  const fontCss = fontFamilyCss(word.fontFamily);
  const textTransform = word.uppercase ? "uppercase" : "none";

  // Per-letter staggered entrance (if selected for hero words)
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
      {/* Highlight Box Wipe */}
      {highlightWipeActive ? (
        <div
          style={{
            position: "absolute",
            inset: "-2px -8px",
            backgroundColor: accent,
            borderRadius: 6 * unit,
            clipPath: `inset(0 ${(1 - Math.min(1, spokenProg * 2.5)) * 100}% 0 0)`,
            boxShadow: `0 4px 16px ${accent}66`,
            zIndex: 0,
          }}
        />
      ) : null}

      {/* Main Text Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          transform: `${transform} scale(${additionalScale})`,
          transformOrigin: "center center",
          color: outlineFill ? (spokenProg > 0.5 ? word.color : "transparent") : textColor,
          WebkitTextStroke: outlineFill ? `2px ${accent}` : undefined,
          textShadow: rgbGlitchActive
            ? `-3px 0 #FF0055, 3px 0 #00F0FF, ${textShadow}`
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
              transform: `translateY(${(1 - enterProg) * 110}%)`,
            }}
          >
            {displayedText}
          </span>
        ) : renderLetters ? (
          displayedText.split("").map((char, ci) => {
            const letterStart = enterStart + ci * 1.5;
            const letterT = Math.max(0, frame - letterStart);
            const letterSpr = spring({
              frame: letterT,
              fps,
              config: { damping: 13, stiffness: 220 },
            });
            const charOpacity = frame >= letterStart ? 1 : 0;
            return (
              <span
                key={ci}
                style={{
                  display: "inline-block",
                  transform: `scale(${letterSpr})`,
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

      {/* Underline Draw Effect */}
      {underlineActive ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: -3 * unit,
            height: Math.max(3, Math.round(4 * unit)),
            backgroundColor: accent,
            borderRadius: 2 * unit,
            width: `${Math.min(1, spokenProg * 2.8) * 100}%`,
            boxShadow: `0 2px 8px ${accent}88`,
            zIndex: 2,
          }}
        />
      ) : null}

      {/* Squiggle Draw Effect */}
      {squiggleActive ? (
        <svg
          width={word.width}
          height={10 * unit}
          style={{
            position: "absolute",
            left: 0,
            bottom: -7 * unit,
            overflow: "visible",
            zIndex: 2,
          }}
        >
          <path
            d={`M 0,5 Q 8,0 16,5 T 32,5 T 48,5 T 64,5 T 80,5 T 96,5 T 112,5 T 128,5 T 144,5 T 160,5 T 176,5 T 192,5 T 208,5 T 224,5 T 240,5 T 256,5 T 272,5`}
            fill="none"
            stroke={accent}
            strokeWidth={Math.max(2.5, 3 * unit)}
            strokeDasharray={word.width}
            strokeDashoffset={(1 - Math.min(1, spokenProg * 2.5)) * word.width}
          />
        </svg>
      ) : null}

      {/* Strike-Through Effect */}
      {strikeActive ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            height: Math.max(3, Math.round(3.5 * unit)),
            backgroundColor: "#FF0055",
            width: `${Math.min(1, spokenProg * 2.5) * 100}%`,
            transform: "translateY(-50%)",
            boxShadow: "0 0 6px #FF0055",
            zIndex: 3,
          }}
        />
      ) : null}
    </div>
  );
};
