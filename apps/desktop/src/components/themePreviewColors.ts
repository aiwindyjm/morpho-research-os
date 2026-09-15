import type { ThemeId } from "@/stores/themeStore";

/**
 * Preview-only palette literals (ADR-022 preview swatches): each option must
 * depict its own skin's FIXED palette — background / accent / accent-alt from
 * packages/ui/src/tokens.css — so these dots deliberately do NOT ride the
 * live theme tokens; reading tokens would render both options identically
 * and the preview would carry no information. This is the app's one
 * sanctioned literal use, shared by the SettingsPage 外观主题 card and the
 * Topbar skin quick menu (I3); all surrounding chrome still consumes tokens
 * only (DESIGN_TOKENS.md / ADR-013).
 */
export const THEME_PREVIEW_COLORS: Record<ThemeId, [string, string, string]> = {
  "lamplit-study": ["#131312", "#d9a05b", "#7fa5a3"],
  "bio-luminal": ["#0c1220", "#53d7f5", "#b8a5ff"],
};
