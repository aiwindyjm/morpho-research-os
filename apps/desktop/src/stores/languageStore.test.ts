import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageId } from "./languageStore";

/**
 * ADR-023 language contract (I3 expansion): the id whitelist is the ten
 * registered languages ("zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "de" |
 * "fr" | "es" | "pt-BR" | "ru"), persistence is `localStorage["morpho.lang"]`,
 * and the resolution ladder is stored key (exact whitelist match) →
 * navigator tag (exact match → primary-subtag prefix match, e.g. "de-AT" →
 * "de", "pt-PT" → "pt-BR" → zh* terminal "zh-CN" → "en"). Application is the
 * i18next instance plus `document.documentElement.lang`. The store resolves
 * its initial state at module-import time, so each case re-imports the
 * module (vi.resetModules) after arranging localStorage/navigator — the
 * themeStore.test.ts pattern.
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
  it("returns a stored id when it is on the whitelist (incl. the eight new ids)", async () => {
    for (const stored of ["ja", "zh-TW", "pt-BR", "en"] as const) {
      localStorage.setItem(LANG_KEY, stored);
      const { getInitialLanguage } = await import("@/i18n");
      expect(getInitialLanguage()).toBe(stored);
      localStorage.removeItem(LANG_KEY);
    }
  });

  it("ignores unknown/stale stored values and falls to the navigator", async () => {
    // "fr-FR" is not on the whitelist ("fr" is); a zh-CN navigator answers.
    localStorage.setItem(LANG_KEY, "fr-FR");
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-CN");
  });

  it("resolves zh-CN from an exact zh-CN navigator language", async () => {
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-CN");
  });

  it("resolves zh-TW from an exact zh-TW navigator language", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "zh-TW",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("zh-TW");
  });

  it("resolves en from a prefixed en navigator language", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "en-US",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("en");
  });

  it("prefix-matches the primary subtag: de-DE and de-AT resolve de", async () => {
    for (const tag of ["de-DE", "de-AT"]) {
      Object.defineProperty(window.navigator, "language", {
        value: tag,
        configurable: true,
      });
      const { getInitialLanguage } = await import("@/i18n");
      expect(getInitialLanguage(), tag).toBe("de");
    }
  });

  it("prefix-matches pt-PT onto pt-BR and keeps an exact pt-BR hit", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "pt-PT",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    expect(getInitialLanguage()).toBe("pt-BR");

    Object.defineProperty(window.navigator, "language", {
      value: "pt-BR",
      configurable: true,
    });
    const { getInitialLanguage: again } = await import("@/i18n");
    expect(again()).toBe("pt-BR");
  });

  it("resolves ko and ru from their regional navigator tags", async () => {
    for (const [tag, expected] of [
      ["ko-KR", "ko"],
      ["ru-RU", "ru"],
    ] as const) {
      Object.defineProperty(window.navigator, "language", {
        value: tag,
        configurable: true,
      });
      const { getInitialLanguage } = await import("@/i18n");
      expect(getInitialLanguage(), tag).toBe(expected);
    }
  });

  it("keeps zh-CN as the terminal for zh variants without a whitelist hit", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "zh-SG",
      configurable: true,
    });
    const { getInitialLanguage } = await import("@/i18n");
    // "zh-SG" has no exact/prefix whitelist match; the zh* ladder terminal
    // stays zh-CN (documented — zh-TW users pick it once in the menu).
    expect(getInitialLanguage()).toBe("zh-CN");
  });

  it("falls to en for a non-zh navigator with no whitelist match", async () => {
    Object.defineProperty(window.navigator, "language", {
      value: "xx-YY",
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
    localStorage.setItem(LANG_KEY, "ja");
    const { useLanguageStore } = await importStore();
    expect(useLanguageStore.getState().language).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
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

  it("applies one of the eight new ids end to end (ja)", async () => {
    const { useLanguageStore } = await importStore();
    const { i18n } = await importI18n();
    useLanguageStore.getState().setLanguage("ja");
    expect(useLanguageStore.getState().language).toBe("ja");
    expect(i18n.language).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(localStorage.getItem(LANG_KEY)).toBe("ja");
  });

  it("switches back to zh-CN", async () => {
    localStorage.setItem(LANG_KEY, "de");
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
    // callers; the runtime whitelist guard is defense in depth. "pt-PT" is
    // resolvable as a navigator tag but not a settable id.
    useLanguageStore.getState().setLanguage("pt-PT" as LanguageId);
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

  it("ja renders the authored ja copy after its translation batch landed", async () => {
    const { i18n } = await importI18n();
    // ja was batch 1 of the translation expansion: the former en-copy
    // placeholder is now the authored Japanese resource.
    await i18n.changeLanguage("ja");
    expect(i18n.t("shell:nav.plan")).toBe("研究プラン");
    expect(i18n.t("shell:saved")).toBe("保存済み");
    await i18n.changeLanguage("zh-CN");
    expect(i18n.t("shell:nav.plan")).toBe("研究计划");
  });
});
