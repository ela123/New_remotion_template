import type React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { referenceUnit } from "./units";

export const ErrorScreen: React.FC<{ message: string; warnings: string[] }> = ({ message, warnings }) => {
  const { width, height } = useVideoConfig();
  const unit = referenceUnit(width, height);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#111318",
        color: "#F5F5F5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: 120 * unit,
        justifyContent: "center",
        gap: 32 * unit,
      }}
    >
      <div style={{ fontSize: 34 * unit, color: "#FF6B6B", fontWeight: 700, letterSpacing: "0.08em" }}>
        CANNOT RENDER CAPTIONS
      </div>
      <div style={{ fontSize: 64 * unit, fontWeight: 700, lineHeight: 1.2 }}>{message}</div>
      {warnings.length > 0 ? (
        <ul style={{ fontSize: 28 * unit, lineHeight: 1.5, color: "#C8CCD4", margin: 0, paddingLeft: 40 * unit }}>
          {warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </AbsoluteFill>
  );
};
