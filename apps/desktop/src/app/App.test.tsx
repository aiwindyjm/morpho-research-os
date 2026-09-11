import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createQueryClient } from "./queryClient";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Workspace integration checks through the real mock transport:
 * navigation, plan review gates, simulated run progress, multi-project
 * isolation, and the assistant's explicit-save flow.
 */

function renderApp() {
  const client = createQueryClient();
  return render(<App client={client} />);
}

beforeEach(() => {
  mockBackend.reset();
  useWorkspaceStore.setState({
    activeProjectId: "",
    activeView: "projects",
    assistantOpen: false,
    inspectorOpen: true,
    sidebarDrawerOpen: false,
  });
});

describe("workspace shell", () => {
  it("lands on the projects view with the seeded projects", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "项目" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId("project-card")).toHaveLength(2);
    });
    // The project name appears in both the switcher and the cards.
    expect(screen.getAllByText("大语言模型推理优化").length).toBeGreaterThan(0);
    expect(screen.getAllByText("脑机接口康复应用").length).toBeGreaterThan(0);
  });

  it("moves focus to the skip link first (keyboard order)", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.tab();
    expect(screen.getByText("跳到主内容")).toHaveFocus();
  });

  it("navigates to the plan view for the active project", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "plan" });
    renderApp();

    expect(await screen.findByRole("heading", { name: "研究计划" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("plan-tree")).toBeInTheDocument();
    });
    // Draft plan review actions are available.
    expect(screen.getByRole("button", { name: "批准计划" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝计划" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
  });
});

describe("plan review → run flow", () => {
  it("approves the draft plan, starts the run, and shows task states", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "plan" });
    renderApp();

    await user.click(await screen.findByRole("button", { name: "批准计划" }));
    await waitFor(() => {
      expect(screen.getByText("已批准")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "开始运行" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始运行" }));
    await waitFor(() => {
      expect(screen.getByText(/运行状态/)).toBeInTheDocument();
    });

    // Simulate orchestrator ticks and observe the tasks view.
    for (let i = 0; i < 6; i++) mockBackend.step();
    await user.click(screen.getByRole("button", { name: "任务" }));
    expect(await screen.findByRole("heading", { name: "任务" })).toBeInTheDocument();
    await waitFor(
      () => {
        const rows = screen.getAllByTestId("task-row");
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.some((row) => row.getAttribute("data-state") !== "PENDING"),
        ).toBe(true);
      },
      { timeout: 4000 },
    );
  });

  it("run.start stays blocked while the plan is a draft", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "tasks" });
    renderApp();
    expect(await screen.findByTestId("page-empty")).toBeInTheDocument();
    expect(screen.getByText(/先到「研究计划」页审查并批准计划/)).toBeInTheDocument();
  });
});

describe("multi-project isolation through the UI", () => {
  it("config edits stay inside the edited project", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "config" });
    const { unmount } = renderApp();

    const topicInput = await screen.findByLabelText(/研究主题/);
    expect(topicInput).toHaveValue("大语言模型推理优化");

    await user.clear(topicInput);
    await user.type(topicInput, "大语言模型推理优化（修订）");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    unmount();

    // Switch to project B: its config is untouched.
    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID, activeView: "config" });
    renderApp();
    const otherTopic = await screen.findByLabelText(/研究主题/);
    expect(otherTopic).toHaveValue("脑机接口在运动康复中的应用");
  });
});

describe("assistant panel", () => {
  it("explains progress, lists reviews, and saves decisions explicitly", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID, activeView: "projects" });
    renderApp();

    const panel = await screen.findByTestId("assistant-panel");
    await waitFor(() => {
      expect(within(panel).getByText("脑机接口康复应用")).toBeInTheDocument();
    });

    await user.click(within(panel).getByRole("button", { name: "解释进度" }));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-response")).toBeInTheDocument();
    });
    expect(screen.getByTestId("assistant-response")).toHaveTextContent(
      "脑机接口康复应用",
    );

    await user.click(within(panel).getByRole("button", { name: "查看待审核项" }));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-response")).toHaveTextContent("待审核");
    });

    await user.type(within(panel).getByLabelText("决定内容"), "下一轮补充隐私维度来源");
    await user.click(within(panel).getByRole("button", { name: "保存决定" }));
    await waitFor(() => {
      expect(within(panel).getByText(/决定已保存/)).toBeInTheDocument();
    });
  });

  it("switches context when the active project changes", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "projects" });
    const { rerender } = render(<App client={createQueryClient()} />);

    const panel = await screen.findByTestId("assistant-panel");
    await waitFor(() => {
      expect(within(panel).getByText("大语言模型推理优化")).toBeInTheDocument();
    });

    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
    rerender(<App client={createQueryClient()} />);
    await waitFor(() => {
      expect(within(screen.getByTestId("assistant-panel")).getByText("脑机接口康复应用"))
        .toBeInTheDocument();
    });
  });
});
