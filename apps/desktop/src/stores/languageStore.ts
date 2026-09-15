import { create } from "zustand";
import {
  applyLanguageToDom,
  getInitialLanguage,
  isLanguageId,
  setLanguage,
  type LanguageId,
} from "@/i18n";

/**
 * Language (interface locale) preference store — ADR-023. The contract is
 * fixed by docs/architecture/adr/ADR-023-frontend-i18n.md and implemented
 * on top of the i18next instance in `@/i18n`:
 *
 *  - Language ids (whitelist): "zh-CN" | "en"; unknown values are ignored.
 *  - Application: `i18n.changeLanguage(id)` + `document.documentElement.lang`.
 *  - Persistence: `localStorage["morpho.lang"]`. Written only by an explicit
 *    user switch; initial resolution is the `getInitialLanguage` ladder.
 *
 * Theme store convention (ADR-022): data-only module, no persistence
 * middleware — writes are explicit in setLanguage, side effects live in the
 * i18n module so instance/DOM/storage cannot drift apart.
 */

interface LanguageState {
  language: LanguageId;
  /**
   * Instant-apply switch: validates against the ADR-023 whitelist, then
   * switches the i18next instance, updates <html lang> and the localStorage
   * key. Unknown ids are ignored (defense in depth — LanguageId already
   * rules them out at compile time), leaving the current selection untouched.
   */
  setLanguage: (id: LanguageId) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: getInitialLanguage(),
  setLanguage: (id) => {
    if (!isLanguageId(id)) return;
    // Side effects (instance/DOM/storage) live in the i18n module so the
    // three can never drift apart; the store only mirrors the reactive id.
    setLanguage(id);
    set({ language: id });
  },
}));

// Keep <html lang> in lockstep with the resolved initial state. The FOUC
// inline script in index.html normally already set this attribute pre-paint
// to the same value, so this is an idempotent no-op in the real app; it
// covers contexts that skip index.html (unit tests, HMR re-entry). No
// persistence here — only an explicit user switch writes the localStorage key.
applyLanguageToDom(useLanguageStore.getState().language);

export type { LanguageId };
