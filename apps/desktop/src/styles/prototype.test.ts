import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Value-pinning test for the prototype effect layer (ADR-022 theme-
 * agnostic composites; intensities carried over from the ADR-021 polish
 * pass). Class names are part of the consumer contract and stay unchanged;
 * since ADR-022 every color in this layer derives from a semantic token
 * via `color-mix(in srgb, <token> N%, transparent)`, so both skins get
 * identical effect geometry. The pins assert the color-mix form plus the
 * tuned percentage.
 */

// Vitest runs per package, so paths resolve against the package root (the
// same base the vitest.config include globs use).
const prototypeCss = readFileSync(join(process.cwd(), "src/styles/prototype.css"), "utf8");
const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");
const tokensCss = readFileSync(
  join(process.cwd(), "../../packages/ui/src/tokens.css"),
  "utf8",
);

/** Extract the body of a top-level rule by exact selector. */
const rule = (css: string, selector: string): string => {
  const match = css.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`),
  );
  if (!match) throw new Error(`rule ${selector} not found`);
  return match[1];
};

/** color-mix over a semantic token, as written in the effect layer. */
const mix = (token: string, pct: number): string =>
  `color-mix(in srgb, var(--morpho-color-${token}) ${pct}%, transparent)`;

describe("theme-agnostic effect layer (ADR-022; ADR-021 intensities)", () => {
  it("keeps the brand-mark brass tile retired (logo image replaced it)", () => {
    expect(prototypeCss).not.toContain(".brand-mark");
    expect(prototypeCss).not.toContain("#e0b06b");
    expect(prototypeCss).not.toContain("#c8914e");
  });

  it("keeps the main glow as a very weak accent radial", () => {
    expect(rule(prototypeCss, ".main-glow")).toContain(
      `radial-gradient(\n      circle at 70% -20%,\n      ${mix("accent", 6)},\n      transparent 38%\n    )`,
    );
    expect(rule(prototypeCss, ".main-glow")).not.toContain("rgb(");
  });

  it("lays the accent metric card on an accent-soft face with an accent corner ring", () => {
    const body = rule(prototypeCss, ".metric-accent");
    expect(body).toContain(
      "linear-gradient(var(--morpho-color-accent-soft), var(--morpho-color-accent-soft))",
    );
    expect(body).toContain(mix("accent", 25));
    expect(rule(prototypeCss, ".metric-accent::after")).toContain(mix("accent", 14));
    expect(body).not.toMatch(/rgb\(45 81 145|rgb\(114 167 255/);
  });

  it("keeps active-card accents flat (no gradient dependence)", () => {
    const accent = rule(prototypeCss, ".card-active-accent");
    expect(accent).toContain(`border-color: ${mix("accent", 55)}`);
    expect(accent).toContain(`linear-gradient(\n    ${mix("accent", 6)},\n    ${mix("accent", 6)}\n  )`);
    const error = rule(prototypeCss, ".card-active-error");
    expect(error).toContain(`border-color: ${mix("error", 55)}`);
    expect(error).toContain(`linear-gradient(\n    ${mix("error", 7)},\n    ${mix("error", 7)}\n  )`);
  });

  it("maps pills and node badges onto their semantic tokens at 10% (neutral: text-primary 5%)", () => {
    expect(rule(prototypeCss, ".pill-success")).toContain(mix("success", 10));
    expect(rule(prototypeCss, ".pill-warning")).toContain(mix("warning", 10));
    expect(rule(prototypeCss, ".pill-accent")).toContain(mix("info", 10));
    expect(rule(prototypeCss, ".pill-neutral")).toContain(mix("text-primary", 5));
    expect(rule(prototypeCss, ".pill-error")).toContain(mix("error", 10));
    expect(rule(prototypeCss, ".node-badge-accent")).toContain(mix("info", 10));
    expect(rule(prototypeCss, ".node-badge-alt")).toContain(mix("accent-alt", 10));
    expect(rule(prototypeCss, ".node-badge-warning")).toContain(mix("warning", 10));
    expect(rule(prototypeCss, ".node-badge-error")).toContain(mix("error", 10));
  });

  it("retires .chip-selected — chip selection now lives in the registered primitives", () => {
    // The Chip/SegmentedControl primitives re-express the selection
    // contract inline with tokens; the app effect class must not return.
    expect(prototypeCss).not.toContain(".chip-selected");
  });

  it("selects option cards with a 3:1 accent border and keeps hover contrast-safe", () => {
    const body = rule(prototypeCss, ".option-selected");
    expect(body).toContain(`border-color: ${mix("accent", 55)}`);
    expect(body).toContain(`background-color: ${mix("accent", 6)}`);
    // Hover deepens the fill instead of touching the 3:1 border.
    const hover = rule(prototypeCss, ".option-selected:hover");
    expect(hover).toContain(mix("accent", 10));
    expect(hover).not.toContain("border-color");
  });

  it("rings the status dots with accent, text-secondary, and warning", () => {
    expect(rule(prototypeCss, ".dot-glow-accent")).toContain(mix("accent", 11));
    // Retuned in the polish pass from the spec's 0.4: the secondary ring
    // must sit at its siblings' intensity (accent 0.11 / warning 0.1), not
    // glow 4x brighter than every other status.
    expect(rule(prototypeCss, ".dot-glow-secondary")).toContain(mix("text-secondary", 10));
    expect(rule(prototypeCss, ".dot-glow-warning")).toContain(mix("warning", 10));
  });

  it("fills progress with solid accent (gradient fills are banned) over a text-primary track", () => {
    const body = rule(prototypeCss, ".progress-fill");
    expect(body).toContain("background: var(--morpho-color-accent)");
    expect(body).not.toContain("gradient");
    expect(rule(prototypeCss, ".progress-track")).toContain(mix("text-primary", 9));
  });

  it("renders the launcher button as solid accent with the shared neutral shadow", () => {
    const body = rule(prototypeCss, ".brand-gradient-button");
    expect(body).toContain("background: var(--morpho-color-accent)");
    expect(body).not.toContain("gradient");
    expect(body).toContain("rgb(5 5 5 / 0.4)");
  });

  it("paints the graph canvas by darkening the background token itself", () => {
    // Theme-agnostic vignette: each skin darkens into its own hue.
    const body = rule(prototypeCss, ".graph-canvas-bg");
    expect(body).toContain(
      "color-mix(in srgb, var(--morpho-color-background) 70%, black)",
    );
    expect(body).toContain("var(--morpho-color-background)");
    expect(body).not.toContain("#111110");
    expect(body).not.toMatch(/rgb\(49 78 136|#0c111a/);
  });

  it("rings the current timeline marker with accent", () => {
    expect(rule(prototypeCss, ".pulse")).toContain(mix("accent", 8));
  });

  it("contains no raw color composites — every rgb/hex literal is the shared shadow", () => {
    // ADR-022: the effect layer defines no colors of its own. The only
    // permitted raw literal is the theme-shared neutral shadow color.
    const literals = [
      ...prototypeCss.matchAll(/#[0-9a-fA-F]{3,8}\b|rgb\([^)]*\)/g),
    ].map((m) => m[0]);
    expect([...new Set(literals)].sort()).toEqual(["rgb(5 5 5 / 0.4)"]);
  });
});

describe("banned-palette guard across stylesheet layers (spec §1)", () => {
  const allCss = `${tokensCss}\n${appCss}\n${prototypeCss}`;

  it("contains no tailwind-default blue, purple, or blue/purple pair", () => {
    for (const banned of [
      "#3b82f6",
      "#b59aff",
      "#72a7ff",
      "rgb(114 167 255",
      "rgb(181 154 255",
      "#2459aa",
      "#8d5eea",
      "#315fae",
      "#7250b8",
    ]) {
      expect(allCss, `banned value ${banned}`).not.toContain(banned);
    }
  });

  it("contains no neon glow, pure-black ground, or pure-white tint composites", () => {
    expect(allCss).not.toContain("#000000");
    expect(allCss).not.toContain("rgb(0 0 0");
    expect(allCss).not.toContain("rgb(255 255 255");
  });
});

describe("app.css stays in sync with the token shadows", () => {
  it("binds the warm-black shadow values", () => {
    expect(appCss).toContain("--shadow-panel: 0 18px 45px rgb(5 5 5 / 0.35)");
    expect(appCss).toContain("--shadow-overlay: 0 20px 50px rgb(5 5 5 / 0.5)");
  });
});
