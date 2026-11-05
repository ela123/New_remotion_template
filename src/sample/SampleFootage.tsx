import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { DEFAULT_SAMPLE, fadeOpacity, isSampleProps, makeOrbs, orbPosition, wrap, type Orb, type SampleProps } from "./scene";

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

export const calculateSampleMetadata: CalculateMetadataFunction<SampleProps> = ({ props }) => {
  const p = isSampleProps(props) ? props : DEFAULT_SAMPLE;
  return {
    width: even(p.width),
    height: even(p.height),
    fps: p.fps,
    durationInFrames: Math.max(1, Math.round(p.durationInSeconds * p.fps)),
  };
};

const OrbLayer: React.FC<{ orb: Orb; t: number; width: number; height: number; size: number }> = ({
  orb,
  t,
  width,
  height,
  size,
}) => {
  const pos = orbPosition(orb, t);
  const radius = orb.radius * size;
  const x = wrap(pos.x, -0.15, 1.15) * width;
  const y = wrap(pos.y, -0.15, 1.15) * height;
  const twinkle = 0.75 + 0.25 * Math.sin(t * (0.6 + orb.depth) + orb.phase);
  const color = `hsla(${orb.hue}, 85%, ${62 + 18 * orb.depth}%, ${orb.opacity * twinkle})`;
  return (
    <div
      style={{
        position: "absolute",
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, ${color} 42%, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
  );
};

export const SampleFootage: React.FC<SampleProps> = () => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const orbs = useMemo(() => makeOrbs("sample-footage"), []);
  const t = frame / fps;
  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const size = Math.hypot(width, height);
  const hueShift = interpolate(progress, [0, 1], [0, 28]);
  const push = interpolate(progress, [0, 1], [1, 1.07]);
  const leakX = interpolate(progress, [0, 1], [-40, 120]);
  const fade = fadeOpacity(frame, fps, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070d", overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <AbsoluteFill
          style={{
            background: `linear-gradient(160deg, hsl(${222 + hueShift}, 55%, 9%) 0%, hsl(${248 + hueShift}, 42%, 16%) 48%, hsl(${18 + hueShift}, 60%, 22%) 100%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 70% 55% at ${30 + 10 * Math.sin(t * 0.2)}% 70%, hsla(${200 + hueShift}, 80%, 45%, 0.28), transparent 70%)`,
          }}
        />
        <AbsoluteFill style={{ transform: `scale(${push})` }}>
          {orbs.map((orb, i) => (
            <OrbLayer key={i} orb={orb} t={t} width={width} height={height} size={size} />
          ))}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background: `linear-gradient(115deg, transparent ${leakX - 30}%, hsla(32, 100%, 70%, 0.14) ${leakX}%, transparent ${leakX + 30}%)`,
            mixBlendMode: "screen",
          }}
        />
        <AbsoluteFill
          style={{ background: "radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.6) 100%)" }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
