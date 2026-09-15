import i18next, { type Resource, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

/**
 * Frontend i18n — ADR-023 (whitelist expanded to ten languages, I3). The
 * contract mirrors the ADR-022 theme store:
 *
 *  - Language ids (whitelist): the ten entries of `LANGUAGE_IDS` below;
 *    unknown persisted values fall through the resolution ladder.
 *  - Resolution ladder (`getInitialLanguage`): persisted
 *    `localStorage["morpho.lang"]` (exact whitelist match) → else the
 *    navigator tag resolved against the whitelist: exact match
 *    ("pt-BR" → "pt-BR") → primary-subtag prefix match ("de-AT" → "de",
 *    "pt-PT" → "pt-BR"; whitelist order breaks ties, so any zh* without an
 *    exact hit resolves "zh-CN") → zh* terminal "zh-CN" → "en". No i18next
 *    languageDetector plugin — the ladder is ~15 lines and unit-testable,
 *    exactly like themeStore's `getInitialTheme`.
 *  - Application: `i18n.changeLanguage(id)` + `document.documentElement.lang`.
 *  - Persistence: `localStorage["morpho.lang"]`. Written only by an explicit
 *    user switch (languageStore.setLanguage); never on resolution.
 *  - Resources are bundled (imported TS modules, no network): local-first
 *    friendly and deterministic in tests. "zh-CN" is the reference locale —
 *    its strings are the exact pre-i18n UI text — and stays the i18next
 *    `fallbackLng`, so a momentarily missing key renders the Chinese string
 *    instead of a raw key (the *ladder's* terminal fallback is "en";
 *    ADR-023 keeps the instance-level fallback on the reference locale).
 *  - Structural parity is enforced by src/i18n/parity.test.ts: every locale
 *    must expose exactly the zh-CN key set in every namespace. The eight
 *    pending-translation locales are explicit en re-export copies
 *    (PLACEHOLDER header per file), so they can never drift from en while
 *    they wait for their translation batch.
 *
 * Namespaces are per surface: "common" (shared sentences), "shell"
 * (app/layout chrome), "settings". Feature views add their own namespace
 * (see resources.ts for the recipe).
 */

export type LanguageId =
  | "zh-CN"
  | "zh-TW"
  | "en"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "pt-BR"
  | "ru";

export const LANGUAGE_STORAGE_KEY = "morpho.lang";

/**
 * Whitelist, in menu order. NOTE: the pre-paint inline FOUC script in
 * index.html still only knows "zh-CN" | "en" — for the eight newer ids the
 * pre-paint `<html lang>` may briefly hold the navigator-derived value until
 * the store module mirrors the resolved id (index.html is deliberately
 * untouched this round; the stored key is already honored by the bundle's
 * i18n init, so rendered text is never affected — only the attribute during
 * the load window).
 */
export const LANGUAGE_IDS = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "pt-BR",
  "ru",
] as const;

/**
 * Locale-invariant display metadata for the language pickers (topbar quick
 * menu + settings card). `nativeName` is each language's self-name — it must
 * never be translated (a user lost in an unfamiliar UI finds their language
 * by its own script). `englishName` is the quiet secondary line that helps
 * users who can't yet read the native script. `shortLabel` is the compact
 * topbar trigger face (native short form for CJK, ISO 639 code otherwise).
 */
export interface LanguageMeta {
  id: LanguageId;
  nativeName: string;
  englishName: string;
  shortLabel: string;
}

export const LANGUAGES: readonly LanguageMeta[] = [
  { id: "zh-CN", nativeName: "简体中文", englishName: "Chinese (Simplified)", shortLabel: "中文" },
  { id: "zh-TW", nativeName: "繁體中文", englishName: "Chinese (Traditional)", shortLabel: "繁體" },
  { id: "en", nativeName: "English", englishName: "English", shortLabel: "EN" },
  { id: "ja", nativeName: "日本語", englishName: "Japanese", shortLabel: "日本語" },
  { id: "ko", nativeName: "한국어", englishName: "Korean", shortLabel: "한국어" },
  { id: "de", nativeName: "Deutsch", englishName: "German", shortLabel: "DE" },
  { id: "fr", nativeName: "Français", englishName: "French", shortLabel: "FR" },
  { id: "es", nativeName: "Español", englishName: "Spanish", shortLabel: "ES" },
  { id: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", shortLabel: "PT" },
  { id: "ru", nativeName: "Русский", englishName: "Russian", shortLabel: "RU" },
];

/**
 * The complete/reference locale and the i18next fallback target. Every key
 * exists here first; other locales may trail it (fallback renders the Chinese
 * string, never a raw key).
 */
export const REFERENCE_LANGUAGE: LanguageId = "zh-CN";

/** Terminal fallback of the resolution ladder (non-zh browser, nothing stored). */
export const FALLBACK_LANGUAGE: LanguageId = "en";

/**
 * Surfaces registered. Feature views own one namespace each; "cards" serves
 * the shared card components; "common" additionally hosts the documented
 * display vocabularies under `vocab.*` (see locales/zh-CN/common.ts).
 */
export const NAMESPACES = [
  "common",
  "shell",
  "settings",
  "projects",
  "overview",
  "config",
  "plan",
  "tasks",
  "sources",
  "knowledge",
  "graph",
  "journal",
  "reports",
  "assistant",
  "cards",
] as const;

export type NamespaceId = (typeof NAMESPACES)[number];

/**
 * Whitelist guard. Exported for the languageStore's defense-in-depth check
 * and for tests exercising the fallback paths.
 */
export function isLanguageId(value: unknown): value is LanguageId {
  return (LANGUAGE_IDS as readonly unknown[]).includes(value);
}

/**
 * Resolves a raw navigator language tag against the whitelist: exact match
 * ("pt-BR"), then primary-subtag prefix match ("de-AT" → "de", "pt-PT" →
 * "pt-BR"; whitelist order breaks ties so zh* without an exact hit lands on
 * "zh-CN"), then the zh* terminal, then "en". Shared by getInitialLanguage;
 * exported for tests.
 */
export function resolveNavigatorLanguage(tag: string): LanguageId {
  const lower = tag.toLowerCase();
  const exact = LANGUAGE_IDS.find((id) => id.toLowerCase() === lower);
  if (exact) return exact;
  const primary = lower.split("-")[0];
  const prefixed = LANGUAGE_IDS.find((id) => {
    const candidate = id.toLowerCase();
    return candidate === primary || candidate.startsWith(`${primary}-`);
  });
  if (prefixed) return prefixed;
  if (primary === "zh") return "zh-CN";
  return FALLBACK_LANGUAGE;
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
    if (typeof nav === "string" && nav.length > 0) {
      return resolveNavigatorLanguage(nav);
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
