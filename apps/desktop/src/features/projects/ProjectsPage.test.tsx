import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { ProjectsPage } from "./ProjectsPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * P1 usability fix: "打开项目 / 进入工作台 / 切换到此项目" must actually
 * navigate — switch the active project AND land on its overview — instead
 * of only flipping the active highlight.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ProjectsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
  useWorkspaceStore.setState({
    activeProjectId: "",
    activeView: "projects",
    assistantOpen: false,
    sidebarDrawerOpen: false,
  });
});

describe("ProjectsPage navigation", () => {
  it("进入工作台 switches the project and routes to the overview", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "projects" });
    renderPage();

    const card = (await screen.findAllByTestId("project-card")).find((element) =>
      element.textContent?.includes("大语言模型推理优化"),
    );
    expect(card).toBeDefined();
    await user.click(
      screen.getAllByRole("button", { name: "进入工作台" })[0],
    );

    expect(useWorkspaceStore.getState().activeProjectId).toBe(PROJECT_A_ID);
    expect(useWorkspaceStore.getState().activeView).toBe("overview");
  });

  it("切换到此项目 (打开项目) on an inactive card navigates to its overview", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "projects" });
    renderPage();

    await screen.findAllByTestId("project-card");
    // The B card is inactive: its primary action reads 切换到此项目, and the
    // ⋯ overflow button carries the same 打开项目 navigation.
    await user.click(screen.getByRole("button", { name: "切换到此项目" }));

    expect(useWorkspaceStore.getState().activeProjectId).toBe(PROJECT_B_ID);
    expect(useWorkspaceStore.getState().activeView).toBe("overview");
  });

  it("研究配置 still routes to the config view", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByTestId("project-card");
    await user.click(screen.getAllByRole("button", { name: "研究配置" })[0]);

    const state = useWorkspaceStore.getState();
    expect([PROJECT_A_ID, PROJECT_B_ID]).toContain(state.activeProjectId);
    expect(state.activeView).toBe("config");
  });
});
