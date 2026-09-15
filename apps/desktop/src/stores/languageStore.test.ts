import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageId } from "./languageStore";

/**
 * ADR-023 language contract: the id whitelist is "zh-CN" | "en", persistence
 * is `localStorage["morpho.lang"]`, the resolution ladder is stored key →
 * navigator zh-prefix → "en", and application is the i18next instance plus
 * `document.documentElement.lang`. The store resolves its initial state at
 * module-import time, so each case re-imports the module (vi.resetModules)
 * after arranging localStorage/navigator — the themeStore.test.ts pattern.
 */

const LANG_KEY = "morpho.lang";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "zh-CN";
  Object.defineProperty(window.navigator, "language", {
    value: "zh-CN",
    configurable: true,
  });
  vi.resetModules();
});

async function importStore() {
  return await import("./languageStore");
}

async function importI18n() {
  return await import("@/i18n");
}

describe("getInitialLanguage fallback ladder", () => {
  it("returns the stored id when it is on the whitelist", async () => {
    localStorage.setItem(LANG_KEY, "en");
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("en");
  });

  it("ignores unknown/stale stored values and falls to the navigator", async () => {
    localStorage.setItem(LANG_KEY, "fr-FR");
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-CN");
  });

  it("resolves zh-CN from a zh-prefixed navigator language", async () => {
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-CN");
  });

  it("resolves en from a non-zh navigator language", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "en-US",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("en");
  });

  it("resolves en when the key is missing and navigator is non-zh", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "de-DE",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("en");
  });

  it("falls to the navigator when localStorage access throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-CN");
    vi.restoreAllMocks();
  });
});

describe("store creation", () => {
  it("seeds state from the ladder and mirrors it onto <html lang>", async () => {
    localStorage.setItem(LANG_KEY, "en");
    const { useLanguageStore } = await importStore();
    expect(useLanguageStore.getState().language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("resolves zh-CN on a fresh zh profile without writing the key", async () => {
    const { useLanguageStore } = await importStore();
    expect(useLanguageStore.getState().language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANG_KEY)).toBeNull();
  });

  it("boots the i18n instance in the resolved language", async () => {
    localStorage.setItem(LANG_KEY, "en");
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    expect(i18n.language).toBe(useLanguageStore.getState().language);
    expect(i18n.isInitialized).toBe(true);
  });
});

describe("setLanguage", () => {
  it("switches state, the i18n instance, <html lang> and persists the key", async () => {
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    useLanguageStore.getState().setLanguage("en");
    expect(useLanguageStore.getState().language).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LANG_KEY)).toBe("en");
  });

  it("switches back to zh-CN", async () => {
    localStorage.setItem(LANG_KEY, "en");
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    useLanguageStore.getState().setLanguage("zh-CN");
    expect(useLanguageStore.getState().language).toBe("zh-CN");
    expect(i18n.language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANG_KEY)).toBe("zh-CN");
  });

  it("ignores unknown ids — state, DOM and storage stay untouched", async () => {
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    // Cast: LanguageId makes unknown ids a compile-time error for typed
    // callers; the runtime whitelist guard is defense in depth.
    useLanguageStore.getState().setLanguage("fr-FR" as LanguageId);
    expect(useLanguageStore.getState().language).toBe("zh-CN");
    expect(i18n.language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANG_KEY)).toBeNull();
  });

  it("applies for the session even when localStorage writes are blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    useLanguageStore.getState().setLanguage("en");
    expect(useLanguageStore.getState().language).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    vi.restoreAllMocks();
  });
});

describe("resource contract", () => {
  it("renders reference zh-CN strings byte-identical to the pre-i18n UI", async () => {
    const { i18n } = await importI18n();
    expect(i18n.t("shell:nav.plan")).toBe("研究计划");
    expect(i18n.t("shell:saved")).toBe("已保存");
    expect(i18n.t("shell:projectSwitcher.status.draft")).toBe("草稿 · 尚未运行");
    expect(i18n.t("shell:projectSwitcher.status.inProgress", { percent: 42 })).toBe(
      "进行中 · 42%",
    );
    expect(i18n.t("common:loading")).toBe("正在加载…");
  });

  it("switches rendered language with changeLanguage (en authored set)", async () => {
    const { i18n } = await importI18n();
    await i18n.changeLanguage("en");
    expect(i18n.t("shell:nav.plan")).toBe("Research Plan");
    expect(i18n.t("shell:skipToContent")).toBe("Skip to main content");
    expect(
      i18n.t("shell:projectSwitcher.status.inProgress", { percent: 42 }),
    ).toBe("In progress · 42%");
    await i18n.changeLanguage("zh-CN");
    expect(i18n.t("shell:nav.plan")).toBe("研究计划");
  });
});
