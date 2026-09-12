import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { AssistantPanel } from "./AssistantPanel";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { listEntries, todayIso } from "@/services/journal";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Explicit conversation capture (PRD §12, DO_NOT_BREAK #12): saving the
 * current assistant conversation into the journal store happens only after
 * the user clicks 保存到日志 and then 确认保存 — never silently, never on the
 * first click alone.
 */

function renderPanel() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <AssistantPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function journalRaw(): string | null {
  return localStorage.getItem(`morpho.journal.${todayIso()}`);
}

beforeEach(() => {
  mockBackend.reset();
  localStorage.clear();
  useWorkspaceStore.setState({
    activeProjectId: PROJECT_B_ID,
    activeView: "projects",
    assistantOpen: true,
    sidebarDrawerOpen: false,
  });
});

describe("AssistantPanel save-to-journal (explicit capture)", () => {
  it("saves the current conversation only after an explicit confirm click", async () => {
    const user = userEvent.setup();
    renderPanel();

    // Produce one exchange: user action → assistant response.
    await user.click(await screen.findByRole("button", { name: "解释进度" }));
    await screen.findByTestId("assistant-response");
    expect(listEntries(todayIso())).toHaveLength(0);

    // First click only arms the confirmation; nothing is written yet.
    await user.click(screen.getByRole("button", { name: "保存到日志" }));
    expect(journalRaw()).toBeNull();

    // Second click writes one journal entry with both messages, the save
    // timestamp, and the project name + id.
    await user.click(screen.getByRole("button", { name: "确认保存" }));
    const entries = listEntries(todayIso());
    expect(entries).toHaveLength(1);
    expect(entries[0].author).toBe("morpho");
    expect(entries[0].time).toMatch(/^\d{2}:\d{2}$/);
    expect(entries[0].content).toContain("脑机接口康复应用");
    expect(entries[0].content).toContain(PROJECT_B_ID);
    expect(entries[0].content).toContain("[用户] 解释进度");
    expect(entries[0].content).toContain("共 14 个任务");

    // Toast announcement + a link into the journal view.
    await waitFor(() => {
      expect(screen.getByTestId("toast-region").textContent).toContain(
        "已保存到对话日志",
      );
    });
    await user.click(screen.getByRole("button", { name: /查看对话日志/ }));
    expect(useWorkspaceStore.getState().activeView).toBe("journal");
  });

  it("saves nothing without the confirm click", async () => {
    const user = userEvent.setup();
    renderPanel();

    // No conversation yet: the save action is disabled.
    const idleButton = await screen.findByRole("button", { name: "保存到日志" });
    expect(idleButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "解释进度" }));
    await screen.findByTestId("assistant-response");

    // Arming the confirmation and cancelling must not persist anything.
    await user.click(screen.getByRole("button", { name: "保存到日志" }));
    expect(journalRaw()).toBeNull();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(journalRaw()).toBeNull();
    expect(listEntries(todayIso())).toHaveLength(0);
    expect(screen.getByRole("button", { name: "保存到日志" })).toBeInTheDocument();
  });
});
