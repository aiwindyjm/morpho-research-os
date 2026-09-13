import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeId } from "./themeStore";

/**
 * ADR-022 theme contract: the id whitelist is `lamplit-study` |
 * `bio-luminal`, persistence is `localStorage["morpho.theme"]`, and the
 * application mechanism is `document.documentElement.dataset.theme`. The
 * store resolves its initial state at module-import time, so each case
 * re-imports the module (vi.resetModules) after arranging localStorage.
 */

const THEME_KEY = "morpho.theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.resetModules();
});

async function importStore() {
  return await import("./themeStore");
}

describe("getInitialTheme fallback ladder", () => {
  it("returns the stored id when it is on the whitelist", async () => {
    localStorage.setItem(THEME_KEY, "bio-luminal");
    const { getInitialTheme } = await importStore();
    expect(getInitialTheme()).toBe("bio-luminal");
  });

  it("falls back to lamplit-study for unknown/stale stored values", async () => {
    localStorage.setItem(THEME_KEY, "solar-punk");
    const { getInitialTheme } = await importStore();
    expect(getInitialTheme()).toBe("lamplit-study");
  });

  it("falls back to lamplit-study when the key is missing", async () => {
    const { getInitialTheme } = await importStore();
    expect(getInitialTheme()).toBe("lamplit-study");
  });

  it("falls back to lamplit-study when localStorage access throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { getInitialTheme } = await importStore();
    expect(getInitialTheme()).toBe("lamplit-study");
    vi.restoreAllMocks();
  });
});

describe("store creation", () => {
  it("seeds state from localStorage and mirrors it onto <html>", async () => {
    localStorage.setItem(THEME_KEY, "bio-luminal");
    const { useThemeStore } = await importStore();
    expect(useThemeStore.getState().theme).toBe("bio-luminal");
    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
  });

  it("defaults to lamplit-study on a fresh profile without writing the key", async () => {
    const { useThemeStore } = await importStore();
    expect(useThemeStore.getState().theme).toBe("lamplit-study");
    expect(document.documentElement.dataset.theme).toBe("lamplit-study");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});

describe("setTheme", () => {
  it("switches state, dataset.theme and persists the key", async () => {
    const { useThemeStore } = await importStore();
    useThemeStore.getState().setTheme("bio-luminal");
    expect(useThemeStore.getState().theme).toBe("bio-luminal");
    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
    expect(localStorage.getItem(THEME_KEY)).toBe("bio-luminal");
  });

  it("switches back to the default skin", async () => {
    localStorage.setItem(THEME_KEY, "bio-luminal");
    const { useThemeStore } = await importStore();
    useThemeStore.getState().setTheme("lamplit-study");
    expect(useThemeStore.getState().theme).toBe("lamplit-study");
    expect(document.documentElement.dataset.theme).toBe("lamplit-study");
    expect(localStorage.getItem(THEME_KEY)).toBe("lamplit-study");
  });

  it("ignores unknown ids — state, DOM and storage stay untouched", async () => {
    const { useThemeStore } = await importStore();
    // Cast: ThemeId makes unknown ids a compile-time error for typed callers;
    // the runtime whitelist guard is defense in depth against untyped drift.
    useThemeStore.getState().setTheme("solar-punk" as ThemeId);
    expect(useThemeStore.getState().theme).toBe("lamplit-study");
    expect(document.documentElement.dataset.theme).toBe("lamplit-study");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("persists even when localStorage writes are blocked (session-only skin)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { useThemeStore } = await importStore();
    useThemeStore.getState().setTheme("bio-luminal");
    expect(useThemeStore.getState().theme).toBe("bio-luminal");
    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
    vi.restoreAllMocks();
  });
});
