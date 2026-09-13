import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { createQueryClient } from "@/app/queryClient";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Mobile navigation drawer (below the lg breakpoint): the 菜单 button
 * toggles the drawer, the drawer is an aria-modal dialog with a Tab focus
 * trap, Escape closes it and returns focus to the button, and navigating
 * from the drawer switches the view and closes it.
 */

function renderLayout() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <WorkspaceLayout />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
  useWorkspaceStore.setState({
    activeProjectId: PROJECT_A_ID,
    activeView: "overview",
    assistantOpen: false,
    sidebarDrawerOpen: false,
  });
});

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  const menu = await screen.findByTestId("mobile-menu-button");
  await user.click(menu);
  const drawer = await screen.findByTestId("sidebar-drawer");
  return { menu, drawer };
}

describe("mobile navigation drawer", () => {
  it("opens from the 菜单 button as an aria-modal dialog and moves focus in", async () => {
    const user = userEvent.setup();
    renderLayout();

    const menu = await screen.findByTestId("mobile-menu-button");
    expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();

    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");

    const drawer = screen.getByTestId("sidebar-drawer");
    const dialog = within(drawer).getByRole("dialog", { name: "导航菜单" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Focus moved into the drawer, never dropped to <body>.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("toggles the drawer closed when the menu button is clicked again", async () => {
    const user = userEvent.setup();
    renderLayout();

    const { menu } = await openDrawer(user);
    await user.click(menu);

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
    });
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("traps Tab focus inside the drawer", async () => {
    const user = userEvent.setup();
    renderLayout();

    const { drawer } = await openDrawer(user);
    const dialog = within(drawer).getByRole("dialog", { name: "导航菜单" });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    renderLayout();

    const { menu } = await openDrawer(user);
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
    });
    expect(menu).toHaveFocus();
  });

  it("closes via the backdrop and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    renderLayout();

    const { menu, drawer } = await openDrawer(user);
    await user.click(within(drawer).getByRole("button", { name: "关闭导航" }));

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
    });
    expect(menu).toHaveFocus();
  });

  it("navigates to the clicked view and closes the drawer", async () => {
    const user = userEvent.setup();
    renderLayout();

    const { menu, drawer } = await openDrawer(user);
    await user.click(within(drawer).getByRole("button", { name: "图谱" }));

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole("heading", { name: "研究关系地图" }),
    ).toBeInTheDocument();
    // Closing after navigation still returns focus to the opener.
    expect(menu).toHaveFocus();
  });
});

describe("assistant dock", () => {
  it("keeps the launcher mounted beneath the panel while it is open", async () => {
    const user = userEvent.setup();
    renderLayout();

    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);

    expect(await screen.findByTestId("assistant-panel")).toBeInTheDocument();
    // Prototype fidelity (spec §8): the gradient launcher stays visible
    // beneath the popup instead of unmounting while the panel is open.
    expect(screen.getByTestId("assistant-launcher")).toBeInTheDocument();
  });

  it("returns focus to the launcher when the panel closes", async () => {
    const user = userEvent.setup();
    renderLayout();

    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);
    await screen.findByTestId("assistant-panel");
    await user.click(
      within(screen.getByTestId("assistant-panel")).getByRole("button", {
        name: "关闭 AI 助手",
      }),
    );

    expect(await screen.findByTestId("assistant-launcher")).toHaveFocus();
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
  });

  // Narrow-window sheet behavior (below lg): the panel renders over a scrim
  // whose only job is to close it — same contract as the sidebar drawer
  // backdrop (hidden from lg up, so the desktop popup has no scrim).
  it("closes via the scrim backdrop and returns focus to the launcher", async () => {
    const user = userEvent.setup();
    renderLayout();

    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);
    await screen.findByTestId("assistant-panel");

    const backdrop = screen.getByTestId("assistant-backdrop");
    expect(backdrop).toHaveAttribute("aria-label", "关闭助手面板");
    await user.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("assistant-backdrop")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });
});
