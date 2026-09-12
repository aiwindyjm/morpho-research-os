import { expect, test } from "@playwright/test";

/**
 * Mobile navigation drawer (docs/frontend/PAGE_PATTERNS.md): below the lg
 * breakpoint the docked sidebar is hidden and navigation moves into a drawer
 * opened from the ☰ 菜单 button, with dialog semantics and focus management.
 */

test.use({ viewport: { width: 375, height: 812 } });

test.describe("mobile navigation drawer", () => {
  test("菜单 opens the drawer as a dialog and navigating closes it", async ({
    page,
  }) => {
    await page.goto("/");

    const menuButton = page.getByTestId("mobile-menu-button");
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();

    const drawer = page.getByRole("dialog", { name: "导航菜单" });
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("sidebar-drawer")).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    // Navigate to a view through the drawer; the drawer must close behind
    // the navigation (setActiveView resets sidebarDrawerOpen).
    await drawer
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "对话日志" })
      .click();

    await expect(page.getByTestId("sidebar-drawer")).toHaveCount(0);
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("heading", { name: "对话日志" }),
    ).toBeVisible();
  });
});
