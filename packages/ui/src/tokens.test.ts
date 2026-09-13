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

describe("lamplit-study token palette (ADR-021)", () => {
  it("pins the warm shell and panel surfaces", () => {
    expectToken("color-background", "#17130f");
    expectToken("color-surface", "#1f1a15");
    expectToken("color-surface-raised", "#292219");
    expectToken("color-surface-sunken", "#120e0b");
    expectToken("color-border", "rgb(222 200 172 / 0.14)");
  });

  it("pins the parchment text ramp", () => {
    expectToken("color-text-primary", "#f2ebe0");
    expectToken("color-text-secondary", "#b3a695");
    // #988a78 is the spec's #8a7e6d brightened within the hue family:
    // the spec value falls to 3.95:1 on surface-raised; this passes 4.5:1
    // on background/surface/raised/sunken (worst 4.67:1).
    expectToken("color-text-muted", "#988a78");
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
    expectToken("color-avatar-bg", "#c9ab7c");
    expectToken("color-avatar-ink", "#1c1207");
    expectToken("color-scrim", "rgb(10 6 3 / 0.62)");
    expectToken("color-overlay-hairline", "rgb(242 235 224 / 0.02)");
    expectToken("color-overlay-soft", "rgb(242 235 224 / 0.035)");
    expectToken("color-overlay-hover", "rgb(242 235 224 / 0.06)");
    expectToken("color-overlay-strong", "rgb(242 235 224 / 0.22)");
    expectToken("color-graph-node", "#2b241c");
    expectToken("color-graph-edge", "rgb(217 160 91 / 0.28)");
    expectToken("color-graph-edge-hover", "rgb(217 160 91 / 0.55)");
    expectToken("color-graph-edge-active", "rgb(217 160 91 / 0.75)");
  });

  it("pins warm-black shadows", () => {
    expectToken("shadow-panel", "0 18px 45px rgb(15 9 4 / 0.35)");
    expectToken("shadow-overlay", "0 20px 50px rgb(15 9 4 / 0.5)");
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
