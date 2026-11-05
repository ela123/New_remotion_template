import React, { useMemo } from "react";
import { random } from "remotion";
import type { Quality, StyleTokens } from "../types";
import type { ChunkLayout, PlacedWord } from "./word-layout";

type MotionGraphicsProps = {
  chunkLayout: ChunkLayout;
  frame: number;
  fps: number;
  unit: number;
  style: StyleTokens;
  quality: Quality;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const DEFAULT_GRAPHICS = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 30,
  vignette: true,
};

export const MotionGraphics: React.FC<MotionGraphicsProps> = ({
  chunkLayout,
  frame,
  fps,
  unit,
  style,
  quality,
}) => {
  const { startFrame, endFrame, bounds } = chunkLayout;
  const accent = style.emphasis.accentColor;
  const graphics = style.graphics ?? DEFAULT_GRAPHICS;

  // Entrance progress of the chunk (0 to 1 over 10 frames)
  const chunkEnterProg = clamp01((frame - startFrame) / 10);

  // Find all hero words in the chunk
  const heroWords = useMemo(() => {
    const list: PlacedWord[] = [];
    chunkLayout.lines.forEach((line) => {
      line.words.forEach((w) => {
        if (w.role === "hero") list.push(w);
      });
    });
    return list;
  }, [chunkLayout]);

  // Current active or spoken hero word
  const activeHeroWord = useMemo(() => {
    for (const hw of heroWords) {
      const s = Math.round(hw.start * fps);
      const e = Math.round(hw.end * fps);
      if (frame >= s - 2 && frame <= e + 8) return hw;
    }
    return heroWords[0] ?? null;
  }, [heroWords, frame, fps]);

  // Bounding box with padding
  const pad = 30 * unit;
  const bx = bounds.x - pad;
  const by = bounds.y - pad;
  const bw = bounds.width + pad * 2;
  const bh = bounds.height + pad * 2;
  const tickLen = Math.min(28 * unit, Math.round(bw * 0.15));

  // Corner brackets draw-on length
  const bracketDash = tickLen * 2;
  const bracketOffset = (1 - chunkEnterProg) * bracketDash;

  // Light sweep timing
  const sweepStart = startFrame + 12;
  const sweepDur = 14;
  const sweepProg = clamp01((frame - sweepStart) / sweepDur);
  const showSweep = graphics.sweep && frame >= sweepStart && frame <= sweepStart + sweepDur;

  // Hero word impact rings
  const rings = heroWords.map((hw, idx) => {
    const hwStart = Math.round(hw.start * fps);
    const ringAge = frame - hwStart;
    if (ringAge < 0 || ringAge > 18) return null;
    const prog = ringAge / 18;
    const r = (16 + prog * 64) * unit;
    const opacity = (1 - prog) * 0.75;
    const cx = hw.x + hw.width / 2;
    const cy = hw.y + hw.height / 2;
    return (
      <circle
        key={`ring-${idx}`}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth={Math.max(1.5, 2.5 * unit)}
        opacity={opacity}
      />
    );
  });

  // Deterministic impact sparkles / particles
  const particleCount = quality === "preview" ? Math.min(8, graphics.maxParticles) : Math.min(12, graphics.maxParticles);
  const particles = useMemo(() => {
    if (!graphics.particles || !activeHeroWord) return null;
    const hwStart = Math.round(activeHeroWord.start * fps);
    const pAge = frame - hwStart;
    if (pAge < 0 || pAge > 16) return null;
    const prog = pAge / 16;
    const cx = activeHeroWord.x + activeHeroWord.width / 2;
    const cy = activeHeroWord.y + activeHeroWord.height / 2;
    const seed = `p-${activeHeroWord.text}-${hwStart}`;

    const items: React.ReactNode[] = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = random(`${seed}-ang-${i}`) * Math.PI * 2;
      const speed = (random(`${seed}-spd-${i}`) * 6 + 2) * unit;
      const size = Math.max(2, (random(`${seed}-sz-${i}`) * 3 + 2) * unit);
      const dist = speed * pAge;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const opacity = (1 - prog) * 0.9;
      const isSquare = i % 2 === 0;

      items.push(
        <div
          key={`part-${i}`}
          style={{
            position: "absolute",
            left: px,
            top: py,
            width: size,
            height: size,
            borderRadius: isSquare ? 1 : "50%",
            backgroundColor: i % 3 === 0 ? "#FFFFFF" : accent,
            opacity,
            pointerEvents: "none",
          }}
        />,
      );
    }
    return items;
  }, [graphics.particles, activeHeroWord, frame, fps, unit, particleCount, accent]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Gradient Glow Blob behind current hero word */}
      {graphics.glowBlob && activeHeroWord ? (
        <div
          style={{
            position: "absolute",
            left: activeHeroWord.x + activeHeroWord.width / 2 - 120 * unit,
            top: activeHeroWord.y + activeHeroWord.height / 2 - 80 * unit,
            width: 240 * unit,
            height: 160 * unit,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at center, ${accent}66 0%, ${accent}33 30%, ${accent}08 55%, transparent 70%)`,
            opacity: 0.65,
            transition: "all 0.15s ease-out",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* SVG Accents: Corner Brackets & Expanding Rings */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
        }}
      >
        {/* Expanding Hero Rings */}
        {graphics.rings ? rings : null}

        {/* Corner Brackets */}
        {graphics.brackets && bw > 0 && bh > 0 ? (
          <g stroke={accent} strokeWidth={Math.max(1.5, 2 * unit)} fill="none" opacity={chunkEnterProg * 0.85}>
            {/* Top-Left */}
            <path
              d={`M ${bx},${by + tickLen} L ${bx},${by} L ${bx + tickLen},${by}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
            />
            {/* Top-Right */}
            <path
              d={`M ${bx + bw - tickLen},${by} L ${bx + bw},${by} L ${bx + bw},${by + tickLen}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
            />
            {/* Bottom-Left */}
            <path
              d={`M ${bx},${by + bh - tickLen} L ${bx},${by + bh} L ${bx + tickLen},${by + bh}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
            />
            {/* Bottom-Right */}
            <path
              d={`M ${bx + bw - tickLen},${by + bh} L ${bx + bw},${by + bh} L ${bx + bw},${by + bh - tickLen}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
            />
          </g>
        ) : null}
      </svg>

      {/* Light Sweep Across Text Box */}
      {showSweep ? (
        <div
          style={{
            position: "absolute",
            left: bounds.x,
            top: bounds.y,
            width: bounds.width,
            height: bounds.height,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)",
              transform: `translateX(${(sweepProg * 2.5 - 1) * 100}%)`,
            }}
          />
        </div>
      ) : null}

      {/* Impact Particles */}
      {particles}

      {/* Soft Vignette Overlay */}
      {graphics.vignette ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.48) 100%)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};
