import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    sidebarDrawerOpen: false,
  });
});

describe("workspace shell", () => {
  it("lands on the projects view with the seeded projects", async () => {
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "所有研究项目" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId("project-card")).toHaveLength(2);
    });
    // The project name appears in both the switcher and the cards.
    expect(screen.getAllByText("大语言模型推理优化").length).toBeGreaterThan(0);
    expect(screen.getAllByText("脑机接口康复应用").length).toBeGreaterThan(0);
  });

  it("filters projects with the search box", async () => {
    renderApp();
    await screen.findAllByTestId("project-card");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("搜索我的研究"), "脑机");
    await waitFor(() => {
      expect(screen.getAllByTestId("project-card")).toHaveLength(1);
    });
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
    expect(await screen.findByRole("heading", { name: "执行中的工作" })).toBeInTheDocument();
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

  it("an unsaved config draft does not carry into the switched project", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "config" });
    renderApp();

    const topicInput = await screen.findByLabelText(/研究主题/);
    expect(topicInput).toHaveValue("大语言模型推理优化");
    await user.clear(topicInput);
    await user.type(topicInput, "未保存的跨项目草稿");

    // Switch projects without saving. The same view instance stays
    // mounted (only the store changes), so its local draft state must be
    // discarded: saving here would otherwise write project A's draft
    // into project B.
    act(() => {
      useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/研究主题/)).toHaveValue(
        "脑机接口在运动康复中的应用",
      );
    });
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
  });
});

describe("assistant panel", () => {
  it("explains progress, lists reviews, and saves decisions explicitly", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID, activeView: "projects" });
    renderApp();

    const launcher = await screen.findByRole("button", { name: "打开 AI 助手" });
    await user.click(launcher);
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

  it("closes the assistant on project switch and reopens with the next context", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "projects" });
    const client = createQueryClient();
    const { rerender } = render(<App client={client} />);

    const launcher = await screen.findByRole("button", { name: "打开 AI 助手" });
    await user.click(launcher);
    const panel = await screen.findByTestId("assistant-panel");
    await waitFor(() => {
      expect(within(panel).getByText("大语言模型推理优化")).toBeInTheDocument();
    });

    // Switching projects triggers the proactive session purge
    // (services/sessionState.ts via app/bridges.tsx): project-scoped caches
    // and volatile overlay flags — including the open assistant — reset
    // with the old project's context.
    act(() => {
      useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
    });
    rerender(<App client={client} />);
    await waitFor(() => {
      expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    });

    // Reopening shows the new active project's context.
    await user.click(launcher);
    const nextPanel = await screen.findByTestId("assistant-panel");
    await waitFor(() => {
      expect(within(nextPanel).getByText("脑机接口康复应用")).toBeInTheDocument();
    });
  });
});

describe("prototype navigation (IA switch)", () => {
  it("registers overview and journal views", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "overview" });
    const first = renderApp();
    // Overview is the real dashboard now (no longer a stub).
    expect(await screen.findByTestId("overview-page")).toBeInTheDocument();
    expect(await screen.findByTestId("metric-coverage")).toBeInTheDocument();
    first.unmount();

    // Journal is fully implemented (no longer a stub).
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "journal" });
    renderApp();
    expect(await screen.findByRole("heading", { name: "对话日志" })).toBeInTheDocument();
    expect(screen.getByTestId("journal-panel")).toBeInTheDocument();
  });

  it("renders a real settings page", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID, activeView: "settings" });
    renderApp();
    expect(await screen.findByRole("heading", { name: "本地工作区设置" })).toBeInTheDocument();
    expect(screen.getByText("私有对话日志")).toBeInTheDocument();
  });
});
