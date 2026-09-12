import { expect, type Page } from "@playwright/test";

/**
 * Shared E2E helpers. Every spec drives the real app served by the Vite dev
 * server; the in-memory mock backend (services/transportProvider.ts, the
 * default transport) answers every command with ~60ms simulated latency, so
 * all assertions auto-wait instead of sleeping.
 */

/** The docked sidebar navigation (visible at the default desktop viewport). */
export function sidebarNav(page: Page) {
  return page.getByRole("navigation", { name: "主导航" });
}

/** Click one of the workspace views in the sidebar (label, e.g. "研究计划"). */
export async function openView(page: Page, label: string) {
  await sidebarNav(page).getByRole("button", { name: label, exact: true }).click();
}

/**
 * Switch the active project through the project switcher popover (the UI
 * isolation boundary). The popover stays open after selecting; dismiss it
 * with an outside click on the topbar — pressing Escape would also close
 * the assistant panel, which listens for Escape globally.
 */
export async function switchToProject(page: Page, projectName: string) {
  await page.getByTestId("project-switcher").click();
  const menu = page.getByTestId("popover-panel");
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: new RegExp(projectName) }).click();
  await page.getByTestId("topbar").click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("topbar")).toContainText(projectName);
}

/**
 * Switch the workspace view through the same zustand store the UI uses.
 * Reserved for views registered in viewRegistry but not yet exposed in the
 * sidebar (ADR-013, e.g. "reports") — no test doubles are involved, the
 * dynamic import resolves to the exact module instance the app loaded.
 */
export async function switchViewViaStore(page: Page, viewId: string) {
  await page.evaluate(async (id) => {
    const store = await import("/src/stores/workspaceStore.ts");
    store.useWorkspaceStore.setState({ activeView: id });
  }, viewId);
}
