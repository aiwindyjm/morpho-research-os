import i18next, { type Resource, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

/**
 * Frontend i18n — ADR-023. The contract mirrors the ADR-022 theme store:
 *
 *  - Language ids (whitelist): "zh-CN" | "en"; unknown persisted values fall
 *    through the resolution ladder.
 *  - Resolution ladder (`getInitialLanguage`): persisted
 *    `localStorage["morpho.lang"]` → else `navigator.language` starting with
 *    "zh" resolves "zh-CN" → else "en". No i18next languageDetector plugin —
 *    the ladder is ~10 lines and unit-testable, exactly like themeStore's
 *    `getInitialTheme`.
 *  - Application: `i18n.changeLanguage(id)` + `document.documentElement.lang`.
 *  - Persistence: `localStorage["morpho.lang"]`. Written only by an explicit
 *    user switch (languageStore.setLanguage); never on resolution.
 *  - Resources are bundled (imported TS modules, no network): local-first
 *    friendly and deterministic in tests. "zh-CN" is the reference locale —
 *    its strings are the exact pre-i18n UI text — and the i18next
 *    `fallbackLng`, so a momentarily missing "en" key renders the Chinese
 *    string instead of a raw key.
 *
 * Namespaces are per surface: "common" (shared sentences), "shell"
 * (app/layout chrome), "settings". Feature views add their own namespace
 * (see resources.ts for the recipe).
 */

export type LanguageId = "zh-CN" | "en";

export const LANGUAGE_STORAGE_KEY = "morpho.lang";

/** Whitelist; mirrored by the pre-paint inline script in index.html. */
export const LANGUAGE_IDS = ["zh-CN", "en"] as const;

/**
 * The complete/reference locale and the i18next fallback target. Every key
 * exists here first; "en" may trail it (fallback renders the Chinese string,
 * never a raw key).
 */
export const REFERENCE_LANGUAGE: LanguageId = "zh-CN";

/** Terminal fallback of the resolution ladder (non-zh browser, nothing stored). */
export const FALLBACK_LANGUAGE: LanguageId = "en";

/** Surfaces registered so far; I2 appends view namespaces (projects, tasks…). */
export const NAMESPACES = ["common", "shell", "settings"] as const;

export type NamespaceId = (typeof NAMESPACES)[number];

/**
 * Whitelist guard. Exported for the languageStore's defense-in-depth check
 * and for tests exercising the fallback paths.
 */
export function isLanguageId(value: unknown): value is LanguageId {
  return (LANGUAGE_IDS as readonly unknown[]).includes(value);
}

/**
 * Resolves the initial language. Shared by the i18n initializer, the
 * languageStore seed and tests exercising the fallback paths.
 */
export function getInitialLanguage(): LanguageId {
  try {
    const stored: unknown = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguageId(stored)) return stored;
  } catch {
    // localStorage unavailable (blocked/private mode) — continue up the ladder.
  }
  try {
    const nav: unknown = typeof navigator === "undefined" ? undefined : navigator.language;
    if (typeof nav === "string" && nav.toLowerCase().startsWith("zh")) {
      return "zh-CN";
    }
  } catch {
    // navigator.language inaccessible — fall through to the terminal fallback.
  }
  return FALLBACK_LANGUAGE;
}

/** DOM side of the contract: mirror the id onto <html lang>. */
export function applyLanguageToDom(id: LanguageId): void {
  document.documentElement.lang = id;
}

/** Persistence side of the contract. Never throws into the caller. */
export function persistLanguage(id: LanguageId): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, id);
  } catch {
    // Writes can be blocked (private mode/quota); the change above still
    // applies for this session.
  }
}

/**
 * One-shot language switch: instance, DOM and persistence in lockstep.
 * Called by the languageStore (the reactive owner); do not call it directly
 * from components or the store state drifts from the instance.
 */
export function setLanguage(id: LanguageId): void {
  if (!isLanguageId(id)) return;
  void i18n.changeLanguage(id);
  applyLanguageToDom(id);
  persistLanguage(id);
}

/**
 * Synchronous-in-practice init: resources are bundled TS modules (no async
 * backend), so the instance is ready before first render and tests stay
 * deterministic. `returnNull: false` keeps t() string-typed.
 */
export const i18n: I18nInstance = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources: resources as Resource,
  lng: getInitialLanguage(),
  fallbackLng: REFERENCE_LANGUAGE,
  defaultNS: "common",
  ns: [...NAMESPACES],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});
