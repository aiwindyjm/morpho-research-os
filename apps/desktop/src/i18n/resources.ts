import type { Resource } from "i18next";
import zhCNCommon from "./locales/zh-CN/common";
import zhCNShell from "./locales/zh-CN/shell";
import zhCNSettings from "./locales/zh-CN/settings";
import zhCNProjects from "./locales/zh-CN/projects";
import zhCNOverview from "./locales/zh-CN/overview";
import zhCNConfig from "./locales/zh-CN/config";
import zhCNPlan from "./locales/zh-CN/plan";
import zhCNTasks from "./locales/zh-CN/tasks";
import zhCNSources from "./locales/zh-CN/sources";
import zhCNKnowledge from "./locales/zh-CN/knowledge";
import zhCNGraph from "./locales/zh-CN/graph";
import zhCNJournal from "./locales/zh-CN/journal";
import zhCNReports from "./locales/zh-CN/reports";
import zhCNAssistant from "./locales/zh-CN/assistant";
import zhCNCards from "./locales/zh-CN/cards";
import enCommon from "./locales/en/common";
import enShell from "./locales/en/shell";
import enSettings from "./locales/en/settings";
import enProjects from "./locales/en/projects";
import enOverview from "./locales/en/overview";
import enConfig from "./locales/en/config";
import enPlan from "./locales/en/plan";
import enTasks from "./locales/en/tasks";
import enSources from "./locales/en/sources";
import enKnowledge from "./locales/en/knowledge";
import enGraph from "./locales/en/graph";
import enJournal from "./locales/en/journal";
import enReports from "./locales/en/reports";
import enAssistant from "./locales/en/assistant";
import enCards from "./locales/en/cards";

/**
 * Bundled i18n resources (ADR-023): plain TS modules imported inline — no
 * network fetch, no async backend, deterministic in jsdom.
 *
 * Glossary (one term per concept across all views and locales):
 *  - project / plan / task / source / claim / evidence / run / coverage /
 *    dimension / gap ("缺口" → gap, never "hole"/"missing piece")
 *  - knowledge node ("知识节点") → knowledge node (short: node)
 *  - 待审核 in task/claim context → "to review"; 待确认 (plan draft kicker)
 *    → "pending review"; 待审核 for un-evaluated sources → "to evaluate"
 *  - Vault / Morpho / Orchestrator / Planner / Provider stay as-is (brand or
 *    proper component names)
 *
 * Recipe for adding a namespace:
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
    projects: zhCNProjects,
    overview: zhCNOverview,
    config: zhCNConfig,
    plan: zhCNPlan,
    tasks: zhCNTasks,
    sources: zhCNSources,
    knowledge: zhCNKnowledge,
    graph: zhCNGraph,
    journal: zhCNJournal,
    reports: zhCNReports,
    assistant: zhCNAssistant,
    cards: zhCNCards,
  },
  en: {
    common: enCommon,
    shell: enShell,
    settings: enSettings,
    projects: enProjects,
    overview: enOverview,
    config: enConfig,
    plan: enPlan,
    tasks: enTasks,
    sources: enSources,
    knowledge: enKnowledge,
    graph: enGraph,
    journal: enJournal,
    reports: enReports,
    assistant: enAssistant,
    cards: enCards,
  },
} satisfies Resource;
