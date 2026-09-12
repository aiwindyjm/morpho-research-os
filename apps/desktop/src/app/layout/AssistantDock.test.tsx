import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { createQueryClient } from "@/app/queryClient";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Focused checks for the floating assistant dock (spec §8): the panel
 * receives focus when it opens, and closing it returns focus to the
 * launcher button instead of dropping focus to <body>.
 */

function renderLayout() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <WorkspaceLayout />
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

describe("AssistantDock focus management", () => {
  it("moves focus into the panel when it opens", async () => {
    const user = userEvent.setup();
    renderLayout();
    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);
    expect(await screen.findByTestId("assistant-panel")).toHaveFocus();
  });

  it("restores focus to the launcher when the panel closes via Escape", async () => {
    const user = userEvent.setup();
    renderLayout();
    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);
    await screen.findByTestId("assistant-panel");

    await user.keyboard("{Escape}");

    expect(await screen.findByTestId("assistant-launcher")).toHaveFocus();
  });
});
