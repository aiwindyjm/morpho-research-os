import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Value-pinning test for the prototype effect layer (ADR-021 "深夜研究室"
 * dispositions, spec §3). Class names are part of the consumer contract and
 * stay unchanged; the composites inside each rule are pinned here.
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

describe("lamplit-study effect layer (ADR-021, spec §3)", () => {
  it("keeps the brand-mark brass tile retired (logo image replaced it)", () => {
    expect(prototypeCss).not.toContain(".brand-mark");
    expect(prototypeCss).not.toContain("#e0b06b");
    expect(prototypeCss).not.toContain("#c8914e");
  });

  it("keeps the main glow as a very weak lamp-warm radial", () => {
    expect(rule(prototypeCss, ".main-glow")).toContain(
      "radial-gradient(circle at 70% -20%, rgb(217 160 91 / 0.06), transparent 38%)",
    );
  });

  it("lays the accent metric card on an accent-soft face with a brass corner ring", () => {
    const body = rule(prototypeCss, ".metric-accent");
    expect(body).toContain(
      "linear-gradient(var(--morpho-color-accent-soft), var(--morpho-color-accent-soft))",
    );
    expect(body).toContain("rgb(217 160 91 / 0.25)");
    expect(rule(prototypeCss, ".metric-accent::after")).toContain(
      "rgb(217 160 91 / 0.14)",
    );
    expect(body).not.toMatch(/rgb\(45 81 145|rgb\(114 167 255/);
  });

  it("keeps active-card accents flat (no gradient dependence)", () => {
    const accent = rule(prototypeCss, ".card-active-accent");
    expect(accent).toContain("rgb(217 160 91 / 0.55)");
    expect(accent).toContain("linear-gradient(rgb(217 160 91 / 0.06), rgb(217 160 91 / 0.06))");
    const error = rule(prototypeCss, ".card-active-error");
    expect(error).toContain("rgb(212 118 118 / 0.55)");
    expect(error).toContain("linear-gradient(rgb(212 118 118 / 0.07), rgb(212 118 118 / 0.07))");
  });

  it("maps pills and node badges onto the new success/warning/celadon-info/error set", () => {
    expect(rule(prototypeCss, ".pill-success")).toContain("rgb(143 191 127 / 0.1)");
    expect(rule(prototypeCss, ".pill-warning")).toContain("rgb(207 125 84 / 0.1)");
    expect(rule(prototypeCss, ".pill-accent")).toContain("rgb(140 166 191 / 0.1)");
    expect(rule(prototypeCss, ".pill-neutral")).toContain("rgb(242 241 238 / 0.05)");
    expect(rule(prototypeCss, ".pill-error")).toContain("rgb(212 118 118 / 0.1)");
    expect(rule(prototypeCss, ".node-badge-accent")).toContain("rgb(140 166 191 / 0.1)");
    expect(rule(prototypeCss, ".node-badge-alt")).toContain("rgb(127 165 163 / 0.1)");
    expect(rule(prototypeCss, ".node-badge-warning")).toContain("rgb(207 125 84 / 0.1)");
    expect(rule(prototypeCss, ".node-badge-error")).toContain("rgb(212 118 118 / 0.1)");
  });

  it("retires .chip-selected — chip selection now lives in the registered primitives", () => {
    // The Chip/SegmentedControl primitives re-express the brass selection
    // contract inline with tokens; the app effect class must not return.
    expect(prototypeCss).not.toContain(".chip-selected");
  });

  it("selects option cards with a 3:1 brass border and keeps hover contrast-safe", () => {
    const body = rule(prototypeCss, ".option-selected");
    expect(body).toContain("rgb(217 160 91 / 0.55)");
    expect(body).toContain("rgb(217 160 91 / 0.06)");
    // Hover deepens the fill instead of relaxing the border below 3:1.
    expect(rule(prototypeCss, ".option-selected:hover")).toContain(
      "rgb(217 160 91 / 0.1)",
    );
    expect(rule(prototypeCss, ".option-selected:hover")).not.toContain("0.3");
  });

  it("swaps the dot glows to brass, warm neutral, and terracotta", () => {
    expect(rule(prototypeCss, ".dot-glow-accent")).toContain("rgb(217 160 91 / 0.11)");
    // Retuned in the polish pass from the spec's 0.4: the parchment ring
    // must sit at its siblings' intensity (accent 0.11 / warning 0.1), not
    // glow 4x brighter than every other status.
    expect(rule(prototypeCss, ".dot-glow-secondary")).toContain("rgb(242 241 238 / 0.1)");
    expect(rule(prototypeCss, ".dot-glow-warning")).toContain("rgb(207 125 84 / 0.1)");
  });

  it("fills progress with solid brass (gradient fills are banned)", () => {
    const body = rule(prototypeCss, ".progress-fill");
    expect(body).toContain("background: var(--morpho-color-accent)");
    expect(body).not.toContain("gradient");
    expect(rule(prototypeCss, ".progress-track")).toContain("rgb(242 241 238 / 0.09)");
  });

  it("renders the launcher button as solid brass with deep-ink text", () => {
    const body = rule(prototypeCss, ".brand-gradient-button");
    expect(body).toContain("background: var(--morpho-color-accent)");
    expect(body).not.toContain("gradient");
    expect(body).toContain("rgb(5 5 5 / 0.4)");
  });

  it("paints the graph canvas as a warm dark vignette over the shell background", () => {
    const body = rule(prototypeCss, ".graph-canvas-bg");
    expect(body).toContain("#111110");
    expect(body).toContain("var(--morpho-color-background)");
    expect(body).not.toMatch(/rgb\(49 78 136|#0c111a/);
  });

  it("rings the current timeline marker with brass", () => {
    expect(rule(prototypeCss, ".pulse")).toContain("rgb(217 160 91 / 0.08)");
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
