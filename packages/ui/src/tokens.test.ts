import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Value-pinning test for the semantic token layer (ADR-021 "深夜研究室"
 * warm-dark palette; supersedes the ADR-013 value table — semantic names
 * and token structure unchanged). The palette is the design-system
 * contract consumed by every page, so the exact values are pinned here.
 */

// Vitest runs per package, so the path resolves against the package root
// (the same base the vitest.config include globs use). Forward slashes are
// accepted by Node on Windows.
const tokensCss = readFileSync(`${process.cwd()}/src/tokens.css`, "utf8");

const token = (name: string): string => {
  const match = tokensCss.match(new RegExp(`--morpho-${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --morpho-${name} not found in tokens.css`);
  return match[1].trim();
};

const expectToken = (name: string, value: string) => {
  expect(token(name), `--morpho-${name}`).toBe(value);
};

describe("lamplit-study token palette (ADR-021 + Amendment 1)", () => {
  it("pins the graphite shell and panel surfaces", () => {
    expectToken("color-background", "#131312");
    expectToken("color-surface", "#1b1b19");
    expectToken("color-surface-raised", "#242422");
    expectToken("color-surface-sunken", "#0e0e0d");
    expectToken("color-border", "rgb(228 226 220 / 0.12)");
  });

  it("pins the neutral text ramp", () => {
    expectToken("color-text-primary", "#f2f1ee");
    expectToken("color-text-secondary", "#a8a5a0");
    // #8f8c85 is the Amendment 1 muted value: the first cut's warm-gray
    // ramp read beige (sepia drift); this neutral gray passes 4.5:1 on
    // background/surface/raised/sunken (worst 4.63:1 on raised).
    expectToken("color-text-muted", "#8f8c85");
  });

  it("pins the brass accent with celadon counter-axis", () => {
    expectToken("color-accent", "#d9a05b");
    expectToken("color-accent-soft", "rgb(217 160 91 / 0.12)");
    expectToken("color-accent-alt", "#7fa5a3");
    expectToken("color-text-on-brand", "#1c1207");
  });

  it("pins the semantic colors", () => {
    expectToken("color-success", "#8fbf7f");
    expectToken("color-warning", "#cf7d54");
    // #d47676 is the spec's #c96a6a brightened within the red family:
    // the spec value drops to 4.19:1 on its own pill tint (and 4.30:1 on
    // surface-raised); this passes everywhere (worst 4.78:1).
    expectToken("color-error", "#d47676");
    expectToken("color-info", "#8ca6bf");
  });

  it("pins the effect/layout expansion values", () => {
    expectToken("color-avatar-bg", "#b8b3a8");
    expectToken("color-avatar-ink", "#21201d");
    expectToken("color-scrim", "rgb(5 5 5 / 0.6)");
    expectToken("color-overlay-hairline", "rgb(242 241 238 / 0.02)");
    expectToken("color-overlay-soft", "rgb(242 241 238 / 0.035)");
    expectToken("color-overlay-hover", "rgb(242 241 238 / 0.06)");
    expectToken("color-overlay-strong", "rgb(242 241 238 / 0.22)");
    expectToken("color-graph-node", "#232320");
    expectToken("color-graph-edge", "rgb(217 160 91 / 0.28)");
    expectToken("color-graph-edge-hover", "rgb(217 160 91 / 0.55)");
    expectToken("color-graph-edge-active", "rgb(217 160 91 / 0.75)");
  });

  it("pins deep neutral shadows", () => {
    expectToken("shadow-panel", "0 18px 45px rgb(5 5 5 / 0.35)");
    expectToken("shadow-overlay", "0 20px 50px rgb(5 5 5 / 0.5)");
  });

  it("keeps structure rules: radii and motion tiers unchanged", () => {
    expectToken("radius-sm", "6px");
    expectToken("radius-md", "8px");
    expectToken("radius-lg", "12px");
    expectToken("radius-brand", "10px");
    expectToken("radius-dock", "14px");
    expectToken("motion-fast", "120ms");
    expectToken("motion-base", "200ms");
    expectToken("motion-slow", "320ms");
  });
});

describe("banned-palette guard (spec §1 acceptance)", () => {
  it("contains no tailwind-default blue, purple, or blue/purple pair", () => {
    for (const banned of [
      "#3b82f6",
      "#b59aff",
      "#72a7ff",
      "rgb(114 167 255",
      "rgb(181 154 255",
    ]) {
      expect(tokensCss, `banned value ${banned}`).not.toContain(banned);
    }
  });

  it("uses no pure-black or pure-white literals", () => {
    expect(tokensCss).not.toContain("#000000");
    expect(tokensCss).not.toContain("#ffffff");
    expect(tokensCss).not.toContain("rgb(0 0 0");
    expect(tokensCss).not.toContain("rgb(255 255 255");
  });
});
