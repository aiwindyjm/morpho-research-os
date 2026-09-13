import { create } from "zustand";

/**
 * Theme (skin) preference store — ADR-022. The contract is fixed by
 * docs/architecture/adr/ADR-022-dual-skin-token-themes.md and implemented at
 * the CSS level in packages/ui/src/tokens.css (per-skin color-token blocks):
 *
 *  - Theme ids (whitelist): "lamplit-study" | "bio-luminal"; unknown values
 *    fall back to the default "lamplit-study".
 *  - Application: `document.documentElement.dataset.theme = "<id>"` on <html>.
 *  - Persistence: `localStorage["morpho.theme"]`. The FOUC inline script in
 *    index.html resolves the key pre-paint; this store writes the key and
 *    re-syncs the dataset attribute on switch, so the two stay in lockstep.
 *
 * Data-only module (workspaceStore convention): labels/descriptions ride
 * along as strings; the SettingsPage owns the presentational preview
 * swatches. No persistence middleware — writes are explicit in setTheme.
 */

export type ThemeId = "lamplit-study" | "bio-luminal";

export const THEME_STORAGE_KEY = "morpho.theme";

export const DEFAULT_THEME: ThemeId = "lamplit-study";

/** ADR-022 whitelist; the single source the FOUC script mirrors. */
export const THEME_IDS = ["lamplit-study", "bio-luminal"] as const;

function isThemeId(value: unknown): value is ThemeId {
  return (THEME_IDS as readonly unknown[]).includes(value);
}

/**
 * Resolves the persisted preference into a whitelist id. Shared by the store
 * initializer and exported for tests to exercise the fallback paths.
 */
export function getInitialTheme(): ThemeId {
  try {
    const stored: unknown = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    // localStorage unavailable (blocked/private mode) — default for the session.
    return DEFAULT_THEME;
  }
}

/** DOM side of the contract: mirror the id onto <html> for the token cascade. */
export function applyThemeToDom(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
}

/** Persistence side of the contract. Never throws into the caller. */
function persistTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Writes can be blocked (private mode/quota); the dataset attribute above
    // still applies the skin for this session.
  }
}

interface ThemeState {
  theme: ThemeId;
  /**
   * Instant-apply switch: validates against the ADR-022 whitelist, then
   * updates the dataset attribute and the localStorage key. Unknown ids are
   * ignored (defense in depth — the ThemeId type already rules them out at
   * compile time), leaving the current selection untouched.
   */
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (id) => {
    if (!isThemeId(id)) return;
    applyThemeToDom(id);
    persistTheme(id);
    set({ theme: id });
  },
}));

// Keep <html> in lockstep with the resolved initial state. The FOUC inline
// script normally already set this attribute pre-paint to the same value, so
// this is an idempotent no-op in the real app; it covers contexts that skip
// index.html (unit tests, HMR re-entry). No persistence here — only an
// explicit user switch writes the localStorage key.
applyThemeToDom(useThemeStore.getState().theme);
