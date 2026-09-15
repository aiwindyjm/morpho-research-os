import type { Resource } from "i18next";
import zhCNCommon from "./locales/zh-CN/common";
import zhCNShell from "./locales/zh-CN/shell";
import zhCNSettings from "./locales/zh-CN/settings";
import enCommon from "./locales/en/common";
import enShell from "./locales/en/shell";
import enSettings from "./locales/en/settings";

/**
 * Bundled i18n resources (ADR-023): plain TS modules imported inline — no
 * network fetch, no async backend, deterministic in jsdom.
 *
 * Recipe for adding a namespace (I2 and later):
 *  1. Create `locales/zh-CN/<surface>.ts` (zh-CN is the reference locale —
 *     move the current Chinese strings in verbatim) and
 *     `locales/en/<surface>.ts` with the authored translations.
 *  2. Import both here and add them under their language keys.
 *  3. Add the namespace id to `NAMESPACES` in `./index.ts`.
 *  4. In the component: `const { t } = useTranslation("<surface>")` and
 *     replace literals with `t("key")` / `t("key", { param })`.
 */
export const resources = {
  "zh-CN": {
    common: zhCNCommon,
    shell: zhCNShell,
    settings: zhCNSettings,
  },
  en: {
    common: enCommon,
    shell: enShell,
    settings: enSettings,
  },
} satisfies Resource;
