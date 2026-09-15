import "@testing-library/jest-dom/vitest";

/*
 * ADR-023 test locale pin. All existing suites assert Simplified Chinese
 * shell/UI text; the app's language resolution ladder reads
 * localStorage["morpho.lang"] first and navigator.language second, so both
 * are pinned to zh-CN before any app module (and its i18n init) evaluates.
 * Dynamic import below because static imports hoist above these statements.
 */
localStorage.setItem("morpho.lang", "zh-CN");
Object.defineProperty(window.navigator, "language", {
  value: "zh-CN",
  configurable: true,
});
Object.defineProperty(window.navigator, "languages", {
  value: ["zh-CN"],
  configurable: true,
});
await import("@/i18n");
