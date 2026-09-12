import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { createQueryClient } from "@/app/queryClient";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Focused checks for the floating assistant dock (spec §8): the panel
 * receives focus when it opens, and closing it returns focus to the
 * launcher button instead of dropping focus to <body>.
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

describe("AssistantDock project isolation", () => {
  it("clears the previous project's response and decision draft when the active project changes", async () => {
    const user = userEvent.setup();
    renderLayout();
    const launcher = await screen.findByTestId("assistant-launcher");
    await user.click(launcher);
    const panel = await screen.findByTestId("assistant-panel");

    // Produce per-project local state: a response card and an unsaved
    // decision draft.
    await user.click(within(panel).getByRole("button", { name: "解释进度" }));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-response")).toBeInTheDocument();
    });
    await user.type(within(panel).getByLabelText("决定内容"), "项目A的未保存决定");

    // The dock stays mounted across a project switch, so the panel must
    // discard state that belongs to the old project.
    act(() => {
      useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("assistant-response")).not.toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("assistant-panel")).getByLabelText("决定内容"),
    ).toHaveValue("");
  });
});
