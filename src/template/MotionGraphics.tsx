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
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number): number => t * t * t;

const DEFAULT_GRAPHICS = {
  brackets: true,
  accentLines: true,
  rings: true,
  glowBlob: true,
  sweep: true,
  particles: true,
  maxParticles: 30,
  vignette: true,
  glassBackdrop: true,
  audioBars: true,
  shockwaves: true,
  cornerDots: true,
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
  const graphics = { ...DEFAULT_GRAPHICS, ...(style.graphics ?? {}) };

  // Entrance progress of the chunk (0 to 1 over 12 frames)
  const chunkEnterProg = clamp01((frame - startFrame) / 12);
  const smoothEnter = easeOutCubic(chunkEnterProg);

  // Exit progress of the chunk (last 10 frames)
  const exitFrames = 10;
  const exitStart = Math.max(startFrame + 5, endFrame - exitFrames);
  const isExiting = frame >= exitStart;
  const exitProg = isExiting ? easeInCubic(clamp01((frame - exitStart) / exitFrames)) : 0;
  const overallOpacity = smoothEnter * (1 - exitProg);

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

  // Bounding box with generous optical padding
  const padX = 34 * unit;
  const padY = 24 * unit;
  const bx = bounds.x - padX;
  const by = bounds.y - padY;
  const bw = bounds.width + padX * 2;
  const bh = bounds.height + padY * 2;
  const tickLen = Math.min(26 * unit, Math.round(bw * 0.12));
  const cornerDotRadius = Math.max(1.8, 2.4 * unit);

  // Corner brackets draw-on length
  const bracketDash = tickLen * 2;
  const bracketOffset = (1 - smoothEnter) * bracketDash;

  // Anamorphic Light Sweep Timing (runs shortly after entrance)
  const sweepStart = startFrame + 8;
  const sweepDur = 16;
  const sweepProg = clamp01((frame - sweepStart) / sweepDur);
  const showSweep = graphics.sweep && frame >= sweepStart && frame <= sweepStart + sweepDur;

  // Hero word impact shockwaves (concentric double rings)
  const shockwaves = heroWords.flatMap((hw, idx) => {
    const hwStart = Math.round(hw.start * fps);
    const ringAge = frame - hwStart;
    if (ringAge < 0 || ringAge > 20) return [];

    const prog1 = clamp01(ringAge / 20);
    const r1 = (14 + prog1 * 72) * unit;
    const op1 = (1 - prog1) * 0.8;

    const prog2 = clamp01((ringAge - 3) / 17);
    const r2 = (10 + prog2 * 56) * unit;
    const op2 = ringAge >= 3 ? (1 - prog2) * 0.5 : 0;

    const cx = hw.x + hw.width / 2;
    const cy = hw.y + hw.height / 2;

    return [
      <circle
        key={`shock-1-${idx}`}
        cx={cx}
        cy={cy}
        r={r1}
        fill="none"
        stroke={accent}
        strokeWidth={Math.max(1.5, 2.5 * unit * (1 - prog1 * 0.5))}
        opacity={op1 * overallOpacity}
      />,
      op2 > 0 ? (
        <circle
          key={`shock-2-${idx}`}
          cx={cx}
          cy={cy}
          r={r2}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={Math.max(1, 1.8 * unit)}
          opacity={op2 * overallOpacity}
        />
      ) : null,
    ];
  });

  // Deterministic impact sparkles / stardust particles
  const particleCount = quality === "preview" ? Math.min(10, graphics.maxParticles) : Math.min(22, graphics.maxParticles);
  const particles = useMemo(() => {
    if (!graphics.particles || !activeHeroWord) return null;
    const hwStart = Math.round(activeHeroWord.start * fps);
    const pAge = frame - hwStart;
    if (pAge < 0 || pAge > 22) return null;

    const prog = pAge / 22;
    const cx = activeHeroWord.x + activeHeroWord.width / 2;
    const cy = activeHeroWord.y + activeHeroWord.height / 2;
    const seed = `p-${activeHeroWord.text}-${hwStart}`;

    const items: React.ReactNode[] = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = random(`${seed}-ang-${i}`) * Math.PI * 2;
      const speed = (random(`${seed}-spd-${i}`) * 5 + 1.8) * unit;
      const size = Math.max(2.5, (random(`${seed}-sz-${i}`) * 3.5 + 2) * unit);
      const dist = speed * pAge;
      const px = cx + Math.cos(angle) * dist;
      // Slight upward gravity drift
      const py = cy + Math.sin(angle) * dist - pAge * 0.6 * unit;
      const opacity = (1 - prog) * 0.95 * overallOpacity;
      const isDiamond = i % 3 === 0;

      items.push(
        <div
          key={`part-${i}`}
          style={{
            position: "absolute",
            left: px,
            top: py,
            width: size,
            height: size,
            borderRadius: isDiamond ? 1 : "50%",
            transform: isDiamond ? "rotate(45deg)" : undefined,
            backgroundColor: i % 2 === 0 ? "#FFFFFF" : accent,
            boxShadow: `0 0 ${4 * unit}px ${i % 2 === 0 ? "#FFFFFF" : accent}`,
            opacity,
            pointerEvents: "none",
          }}
        />,
      );
    }
    return items;
  }, [graphics.particles, activeHeroWord, frame, fps, unit, particleCount, accent, overallOpacity]);

  // Audio Equalizer Wave Bar heights (simulated dynamic speech bars)
  const isSpeaking = heroWords.some((hw) => {
    const s = Math.round(hw.start * fps);
    const e = Math.round(hw.end * fps);
    return frame >= s && frame <= e;
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: overallOpacity,
      }}
    >
      {/* 1. Frosted Glassmorphism Backdrop Card */}
      {graphics.glassBackdrop && bw > 0 && bh > 0 ? (
        <div
          style={{
            position: "absolute",
            left: bx,
            top: by,
            width: bw,
            height: bh,
            borderRadius: 22 * unit,
            backgroundColor: "rgba(10, 12, 18, 0.52)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: `0 ${14 * unit}px ${40 * unit}px rgba(0, 0, 0, 0.65), 0 0 ${30 * unit}px ${accent}14, inset 0 1px 0 rgba(255, 255, 255, 0.22)`,
            pointerEvents: "none",
            transform: `scale(${0.96 + 0.04 * smoothEnter})`,
            transformOrigin: "center center",
          }}
        />
      ) : null}

      {/* 2. Top Audio Frequency / Keynote Status Badge */}
      {graphics.audioBars && bw > 0 ? (
        <div
          style={{
            position: "absolute",
            left: bounds.x + bounds.width / 2,
            top: by - 16 * unit,
            transform: `translate(-50%, -50%) scale(${smoothEnter})`,
            display: "inline-flex",
            alignItems: "center",
            gap: 6 * unit,
            padding: `${3 * unit}px ${12 * unit}px`,
            borderRadius: 999,
            backgroundColor: "rgba(12, 14, 22, 0.8)",
            border: `1px solid ${accent}44`,
            boxShadow: `0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px ${accent}22`,
            pointerEvents: "none",
          }}
        >
          {/* 4 Animated Dynamic Equalizer Bars */}
          {[0, 1, 2, 3].map((barIdx) => {
            const barFreq = 0.35;
            const barPhase = barIdx * 1.4;
            const barAmp = isSpeaking ? 7 : 3;
            const barH = Math.max(3, Math.round((5 + Math.sin(frame * barFreq + barPhase) * barAmp) * unit));
            return (
              <span
                key={`bar-${barIdx}`}
                style={{
                  display: "inline-block",
                  width: Math.max(2.5, 3 * unit),
                  height: barH,
                  borderRadius: 1.5 * unit,
                  backgroundColor: accent,
                  boxShadow: `0 0 4px ${accent}`,
                  transition: "height 0.05s ease-out",
                }}
              />
            );
          })}
          <span
            style={{
              fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
              fontSize: Math.round(11 * unit),
              fontWeight: 700,
              letterSpacing: `${0.14 * unit}em`,
              textTransform: "uppercase",
              color: "#FFFFFF",
              opacity: 0.9,
              marginLeft: 4 * unit,
            }}
          >
            KEY POINT
          </span>
        </div>
      ) : null}

      {/* 3. Volumetric Hero Glow Bloom behind active word */}
      {graphics.glowBlob && activeHeroWord ? (
        <div
          style={{
            position: "absolute",
            left: activeHeroWord.x + activeHeroWord.width / 2 - 160 * unit,
            top: activeHeroWord.y + activeHeroWord.height / 2 - 100 * unit,
            width: 320 * unit,
            height: 200 * unit,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at center, ${accent}66 0%, ${accent}30 35%, ${accent}08 60%, transparent 75%)`,
            opacity: 0.75,
            pointerEvents: "none",
            transform: `scale(${1 + Math.sin(frame * 0.2) * 0.08})`,
          }}
        />
      ) : null}

      {/* 4. SVG Accents: Precision HUD Corner Reticles & Shockwave Rings */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
        }}
      >
        {/* Expanding Hero Shockwaves */}
        {graphics.rings || graphics.shockwaves ? shockwaves : null}

        {/* Precision Corner Reticles */}
        {graphics.brackets && bw > 0 && bh > 0 ? (
          <g stroke={accent} strokeWidth={Math.max(1.5, 2 * unit)} fill="none" opacity={smoothEnter * 0.9}>
            {/* Top-Left Bracket */}
            <path
              d={`M ${bx},${by + tickLen} L ${bx},${by} L ${bx + tickLen},${by}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
              strokeLinecap="round"
            />
            {/* Top-Right Bracket */}
            <path
              d={`M ${bx + bw - tickLen},${by} L ${bx + bw},${by} L ${bx + bw},${by + tickLen}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
              strokeLinecap="round"
            />
            {/* Bottom-Left Bracket */}
            <path
              d={`M ${bx},${by + bh - tickLen} L ${bx},${by + bh} L ${bx + tickLen},${by + bh}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
              strokeLinecap="round"
            />
            {/* Bottom-Right Bracket */}
            <path
              d={`M ${bx + bw - tickLen},${by + bh} L ${bx + bw},${by + bh} L ${bx + bw},${by + bh - tickLen}`}
              strokeDasharray={bracketDash}
              strokeDashoffset={bracketOffset}
              strokeLinecap="round"
            />

            {/* Glowing Corner Dots at Bracket Vertices */}
            {graphics.cornerDots ? (
              <g fill={accent} stroke="none">
                <circle cx={bx} cy={by} r={cornerDotRadius} />
                <circle cx={bx + bw} cy={by} r={cornerDotRadius} />
                <circle cx={bx} cy={by + bh} r={cornerDotRadius} />
                <circle cx={bx + bw} cy={by + bh} r={cornerDotRadius} />
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {/* 5. Anamorphic Prismatic Lens Streak / Light Sweep */}
      {showSweep && bw > 0 && bh > 0 ? (
        <div
          style={{
            position: "absolute",
            left: bx,
            top: by,
            width: bw,
            height: bh,
            overflow: "hidden",
            borderRadius: 22 * unit,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(115deg, transparent 15%, rgba(255,255,255,0.04) 35%, rgba(255,255,255,0.45) 50%, rgba(0,240,255,0.2) 53%, transparent 72%)",
              transform: `translateX(${(sweepProg * 2.6 - 1.1) * 100}%)`,
            }}
          />
        </div>
      ) : null}

      {/* 6. Impact Sparkles / Stardust */}
      {particles}

      {/* 7. Soft Vignette Overlay */}
      {graphics.vignette ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,0,0,0.52) 100%)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};
