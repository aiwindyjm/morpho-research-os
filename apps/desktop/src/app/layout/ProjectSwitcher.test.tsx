import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { createQueryClient } from "@/app/queryClient";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Prototype switcher menu (spec §3): two seeded projects with per-project
 * progress lines, the active project marked, and the 管理全部 shortcut.
 */

function renderSwitcher() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProjectSwitcher />
    </QueryClientProvider>,
  );
}

/** Open the popover and wait for both seeded project rows to render. */
async function openMenu() {
  const user = userEvent.setup();
  renderSwitcher();
  await user.click(await screen.findByTestId("project-switcher"));
  await waitFor(() => {
    expect(screen.getAllByTestId("project-menu-item")).toHaveLength(2);
  });
  return screen.getAllByTestId("project-menu-item");
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

describe("ProjectSwitcher menu", () => {
  it("lists both seeded projects with a progress/status line each", async () => {
    const rows = await openMenu();
    const rowFor = (name: string) =>
      rows.find((row) => row.textContent?.includes(name));
    expect(rowFor("大语言模型推理优化")).toBeDefined();
    expect(rowFor("脑机接口康复应用")).toBeDefined();
    // Project A is the draft fixture: planned but never executed.
    await waitFor(() => {
      expect(
        within(rowFor("大语言模型推理优化")!).getByText("草稿 · 尚未运行"),
      ).toBeInTheDocument();
    });
  });

  it("marks the active project row and offers the manage-all shortcut", async () => {
    await openMenu();
    const rows = screen.getAllByTestId("project-menu-item");
    const activeRow = rows.find((row) => row.getAttribute("aria-selected") === "true");
    expect(activeRow).toBeDefined();
    expect(activeRow!.textContent).toContain("大语言模型推理优化");
    expect(within(activeRow!).getByText("✓")).toBeInTheDocument();
    expect(screen.getByTestId("project-menu-manage")).toHaveTextContent("管理全部");
  });
});
