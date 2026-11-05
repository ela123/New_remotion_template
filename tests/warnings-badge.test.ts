import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ isRendering: false }));

vi.mock("remotion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("remotion")>()),
  getRemotionEnvironment: () => ({ isRendering: env.isRendering, isStudio: !env.isRendering }),
}));

const { WarningsBadge } = await import("../src/template/WarningsBadge");

const render = (warnings: string[]) => renderToStaticMarkup(createElement(WarningsBadge, { warnings, unit: 1 }));

describe("WarningsBadge", () => {
  it("shows a collapsed count in Studio", () => {
    env.isRendering = false;
    const html = render(["[overlap] Cue 1", "[too-short] Cue 2"]);
    expect(html).toContain("2 warnings");
    expect(html).not.toContain("[overlap]");
  });

  it("renders nothing while rendering or without warnings", () => {
    env.isRendering = true;
    expect(render(["[overlap] Cue 1"])).toBe("");
    env.isRendering = false;
    expect(render([])).toBe("");
  });
});
