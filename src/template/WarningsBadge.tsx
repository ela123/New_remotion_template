import type React from "react";
import { useState } from "react";
import { getRemotionEnvironment } from "remotion";
import { studioWarnings } from "./studio-warnings";

export const WarningsBadge: React.FC<{ warnings: string[]; unit: number }> = ({ warnings, unit }) => {
  const [open, setOpen] = useState(false);
  const model = studioWarnings(warnings, getRemotionEnvironment());
  if (!model) return null;
  const label = `${model.count} warning${model.count === 1 ? "" : "s"}`;

  return (
    <div
      onClick={() => setOpen((value) => !value)}
      title={open ? "Hide warnings" : "Show warnings (Studio only, never rendered)"}
      style={{
        position: "absolute",
        top: 24 * unit,
        left: 24 * unit,
        maxWidth: 900 * unit,
        padding: `${8 * unit}px ${16 * unit}px`,
        borderRadius: 12 * unit,
        background: "rgba(17, 19, 24, 0.82)",
        border: `${Math.max(1, 2 * unit)}px solid rgba(255, 196, 0, 0.7)`,
        color: "#F5F5F5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 22 * unit,
        lineHeight: 1.4,
        cursor: "pointer",
        zIndex: 1000,
      }}
    >
      <div style={{ color: "#FFC400", fontWeight: 700 }}>{label}</div>
      {open ? (
        <ul style={{ margin: `${6 * unit}px 0 0`, paddingLeft: 24 * unit, fontSize: 18 * unit }}>
          {model.listed.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
          {model.hidden > 0 ? <li>{`and ${model.hidden} more (see the browser console)`}</li> : null}
        </ul>
      ) : null}
    </div>
  );
};
