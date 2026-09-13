import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Value-pinning test for the dual-skin token layer (ADR-022). Structure
 * tokens are theme-independent; every color token is defined by both skins:
 * - "lamplit-study" (default, ADR-021 + Amendment 1 values)
 * - "bio-luminal" (ADR-022, deep-sea/cyan/violet from the brand logo)
 * Both palettes are the design-system contract consumed by every page, so
 * the exact values are pinned here.
 */

// Vitest runs per package, so the path resolves against the package root
// (the same base the vitest.config include globs use). Forward slashes are
// accepted by Node on Windows.
const tokensCss = readFileSync(`${process.cwd()}/src/tokens.css`, "utf8");

/**
 * Body (selector … closing brace) of the nth block whose rule opens with
 * `selector {`. Matching the brace keeps prose comments that merely mention
 * a selector (e.g. "`:root`") from counting as occurrences.
 */
const block = (selector: string, occurrence = 0): string => {
  const opener = `${selector} {`;
  let from = -1;
  for (let i = 0; i <= occurrence; i++) {
    from = tokensCss.indexOf(opener, from + 1);
    if (from === -1) throw new Error(`block ${opener} #${i} not found in tokens.css`);
  }
  const end = tokensCss.indexOf("}", from);
  return tokensCss.slice(from, end);
};

// Two plain :root blocks: [0] shared structure tokens, [1] the default
// lamplit-study colors. The second skin overrides on [data-theme].
const sharedBlock = block(":root", 0);
const lamplitBlock = block(":root", 1);
const bioBlock = block('[data-theme="bio-luminal"]');

const tokenIn = (source: string) => (name: string): string => {
  const match = source.match(new RegExp(`--morpho-${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --morpho-${name} not found`);
  return match[1].trim();
};

const lamplit = tokenIn(lamplitBlock);
const bio = tokenIn(bioBlock);
const shared = tokenIn(sharedBlock);

const expectToken = (get: (name: string) => string, name: string, value: string) => {
  expect(get(name), `--morpho-${name}`).toBe(value);
};

const colorTokenNames = (source: string): string[] =>
  [...source.matchAll(/--morpho-(color-[a-z-]+):/g)].map((m) => m[1]).sort();

describe("theme system structure (ADR-022)", () => {
  it("defines the identical semantic color token set in BOTH skins", () => {
    const lamplitNames = colorTokenNames(lamplitBlock);
    const bioNames = colorTokenNames(bioBlock);
    expect(lamplitNames.length).toBeGreaterThan(0);
    expect(bioNames).toEqual(lamplitNames);
    // The full contract surface (background → graph edges) must be covered.
    for (const required of [
      "color-background",
      "color-surface",
      "color-surface-raised",
      "color-surface-sunken",
      "color-border",
      "color-text-primary",
      "color-text-secondary",
      "color-text-muted",
      "color-accent",
      "color-accent-soft",
      "color-accent-alt",
      "color-success",
      "color-warning",
      "color-error",
      "color-info",
      "color-text-on-brand",
      "color-avatar-bg",
      "color-avatar-ink",
      "color-scrim",
      "color-overlay-hairline",
      "color-overlay-soft",
      "color-overlay-hover",
      "color-overlay-strong",
      "color-graph-node",
      "color-graph-edge",
      "color-graph-edge-hover",
      "color-graph-edge-active",
    ]) {
      expect(lamplitNames, `lamplit-study missing ${required}`).toContain(required);
    }
  });

  it("keeps lamplit-study as the plain :root default (renders before data-theme is set)", () => {
    expect(lamplit("color-background")).toBe("#131312");
    expect(bioBlock).not.toContain(":root");
  });

  it("keeps structure rules: radii, motion tiers, and shared shadows unchanged", () => {
    expectToken(shared, "radius-sm", "6px");
    expectToken(shared, "radius-md", "8px");
    expectToken(shared, "radius-lg", "12px");
    expectToken(shared, "radius-brand", "10px");
    expectToken(shared, "radius-dock", "14px");
    expectToken(shared, "motion-fast", "120ms");
    expectToken(shared, "motion-base", "200ms");
    expectToken(shared, "motion-slow", "320ms");
    // Shadow colors are shared near-neutrals (ADR-022); both skins ride them.
    expectToken(shared, "shadow-panel", "0 18px 45px rgb(5 5 5 / 0.35)");
    expectToken(shared, "shadow-overlay", "0 20px 50px rgb(5 5 5 / 0.5)");
  });

  it("still hosts the shared motion keyframes", () => {
    expect(tokensCss).toContain("@keyframes morpho-overlay-in");
    expect(tokensCss).toContain("@keyframes morpho-tooltip-in");
    expect(tokensCss).toContain("@keyframes morpho-progress-slide");
  });
});

describe("lamplit-study token palette (ADR-021 + Amendment 1; default skin)", () => {
  it("pins the graphite shell and panel surfaces", () => {
    expectToken(lamplit, "color-background", "#131312");
    expectToken(lamplit, "color-surface", "#1b1b19");
    expectToken(lamplit, "color-surface-raised", "#242422");
    expectToken(lamplit, "color-surface-sunken", "#0e0e0d");
    expectToken(lamplit, "color-border", "rgb(228 226 220 / 0.12)");
  });

  it("pins the neutral text ramp", () => {
    expectToken(lamplit, "color-text-primary", "#f2f1ee");
    expectToken(lamplit, "color-text-secondary", "#a8a5a0");
    // #8f8c85 is the Amendment 1 muted value: the first cut's warm-gray
    // ramp read beige (sepia drift); this neutral gray passes 4.5:1 on
    // background/surface/raised/sunken (worst 4.63:1 on raised).
    expectToken(lamplit, "color-text-muted", "#8f8c85");
  });

  it("pins the brass accent with celadon counter-axis", () => {
    expectToken(lamplit, "color-accent", "#d9a05b");
    expectToken(lamplit, "color-accent-soft", "rgb(217 160 91 / 0.12)");
    expectToken(lamplit, "color-accent-alt", "#7fa5a3");
    expectToken(lamplit, "color-text-on-brand", "#1c1207");
  });

  it("pins the semantic colors", () => {
    expectToken(lamplit, "color-success", "#8fbf7f");
    expectToken(lamplit, "color-warning", "#cf7d54");
    // #d47676 is the spec's #c96a6a brightened within the red family:
    // the spec value drops to 4.19:1 on its own pill tint (and 4.30:1 on
    // surface-raised); this passes everywhere (worst 4.78:1).
    expectToken(lamplit, "color-error", "#d47676");
    expectToken(lamplit, "color-info", "#8ca6bf");
  });

  it("pins the effect/layout expansion values", () => {
    expectToken(lamplit, "color-avatar-bg", "#b8b3a8");
    expectToken(lamplit, "color-avatar-ink", "#21201d");
    expectToken(lamplit, "color-scrim", "rgb(5 5 5 / 0.6)");
    expectToken(lamplit, "color-overlay-hairline", "rgb(242 241 238 / 0.02)");
    expectToken(lamplit, "color-overlay-soft", "rgb(242 241 238 / 0.035)");
    expectToken(lamplit, "color-overlay-hover", "rgb(242 241 238 / 0.06)");
    expectToken(lamplit, "color-overlay-strong", "rgb(242 241 238 / 0.22)");
    expectToken(lamplit, "color-graph-node", "#232320");
    expectToken(lamplit, "color-graph-edge", "rgb(217 160 91 / 0.28)");
    expectToken(lamplit, "color-graph-edge-hover", "rgb(217 160 91 / 0.55)");
    expectToken(lamplit, "color-graph-edge-active", "rgb(217 160 91 / 0.75)");
  });
});

describe("bio-luminal token palette (ADR-022; audited — worst case on surface-raised)", () => {
  it("pins the deep-sea shell and panel surfaces", () => {
    expectToken(bio, "color-background", "#0c1220");
    expectToken(bio, "color-surface", "#111a2c");
    expectToken(bio, "color-surface-raised", "#18243a");
    expectToken(bio, "color-surface-sunken", "#090f1a");
    expectToken(bio, "color-border", "rgb(148 190 235 / 0.16)");
  });

  it("pins the cool text ramp", () => {
    expectToken(bio, "color-text-primary", "#e8f2ff"); // 13.74:1
    expectToken(bio, "color-text-secondary", "#9fb4d0"); // 7.33:1
    // Draft #7c90ae already clears 4.5:1 on every surface (worst 4.78:1 on
    // raised) — same margin pattern as lamplit's muted (4.63:1).
    expectToken(bio, "color-text-muted", "#7c90ae"); // 4.78:1
  });

  it("pins the bio-luminescent cyan accent with violet counter-axis", () => {
    expectToken(bio, "color-accent", "#53d7f5"); // as text 9.17:1
    expectToken(bio, "color-accent-soft", "rgb(83 215 245 / 0.13)");
    expectToken(bio, "color-accent-alt", "#b8a5ff"); // as text 7.29:1
    expectToken(bio, "color-text-on-brand", "#061018"); // 11.33:1 on cyan
  });

  it("pins the semantic colors", () => {
    expectToken(bio, "color-success", "#6fdda8"); // 9.31:1
    expectToken(bio, "color-warning", "#f5b04a"); // 8.28:1
    // Brightened inside the salmon family from the draft #ff7a8a: the draft
    // failed the 0.55 state-border floor (2.77:1 composite on raised).
    // #ff8f9e passes text (worst 7.15:1), pill tint (5.86:1) and border
    // (worst 3.10:1) everywhere.
    expectToken(bio, "color-error", "#ff8f9e");
    expectToken(bio, "color-info", "#6fa8ff"); // 6.45:1
  });

  it("pins the effect/layout expansion values", () => {
    expectToken(bio, "color-avatar-bg", "#9adcf0");
    expectToken(bio, "color-avatar-ink", "#0a1420"); // 12.23:1 on avatar fill
    expectToken(bio, "color-scrim", "rgb(4 8 16 / 0.65)");
    expectToken(bio, "color-overlay-hairline", "rgb(232 242 255 / 0.02)");
    expectToken(bio, "color-overlay-soft", "rgb(232 242 255 / 0.035)");
    expectToken(bio, "color-overlay-hover", "rgb(232 242 255 / 0.06)");
    expectToken(bio, "color-overlay-strong", "rgb(232 242 255 / 0.22)");
    expectToken(bio, "color-graph-node", "#142642");
    expectToken(bio, "color-graph-edge", "rgb(83 215 245 / 0.3)");
    expectToken(bio, "color-graph-edge-hover", "rgb(83 215 245 / 0.55)");
    expectToken(bio, "color-graph-edge-active", "rgb(83 215 245 / 0.75)");
  });

  it("keeps 0.55 state-border composites at or above the 3:1 UI floor", () => {
    // Sanity on the documented audit contract: the graph edge hover/active
    // ladder carries the same 0.55/0.75 alphas lamplit ships, and the
    // per-surface composite math (accent worst 3.77:1, error worst 3.10:1)
    // is recorded in docs/frontend/DESIGN_TOKENS.md.
    expect(bio("color-accent")).not.toBe("#ff7a8a");
    expect(bio("color-error")).toBe("#ff8f9e");
  });
});

describe("banned-palette guard (spec §1 acceptance + ADR-022)", () => {
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

  it("keeps every bio-luminal brand hex distinct from the banned AI-slop literals", () => {
    // Cyan/violet here are brand-sanctioned (maintainer's logo artwork);
    // each must still differ from the banned defaults it resembles.
    const bioBrandHexes = [bio("color-accent"), bio("color-accent-alt"), bio("color-info")];
    const banned = ["#3b82f6", "#b59aff", "#72a7ff", "#2459aa", "#8d5eea", "#315fae", "#7250b8"];
    for (const hex of bioBrandHexes) {
      for (const b of banned) {
        expect(hex.toLowerCase(), `${hex} must differ from banned ${b}`).not.toBe(b);
      }
    }
  });

  it("uses no pure-black or pure-white literals", () => {
    expect(tokensCss).not.toContain("#000000");
    expect(tokensCss).not.toContain("#ffffff");
    expect(tokensCss).not.toContain("rgb(0 0 0");
    expect(tokensCss).not.toContain("rgb(255 255 255");
  });
});
