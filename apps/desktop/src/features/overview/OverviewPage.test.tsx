import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { OverviewPage } from "./OverviewPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { timelineService } from "@/services/api";
import type { TimelineEntry } from "@/types/domain";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Overview dashboard (spec §5). All numbers are pinned to the deterministic
 * fixtures: project B (脑机接口康复应用) is the project with an approved
 * plan, a completed run, revealed knowledge, timeline events, and pending
 * gap proposals — project A is still a draft plan with nothing executed.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <OverviewPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
  useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OverviewPage", () => {
  it("renders the four metric cards", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("metric-coverage")).toBeInTheDocument();
    });
    expect(screen.getByTestId("metric-sources")).toBeInTheDocument();
    expect(screen.getByTestId("metric-knowledge")).toBeInTheDocument();
    expect(screen.getByTestId("metric-reviews")).toBeInTheDocument();
  });

  it("shows the fixture coverage on the accent card", async () => {
    renderPage();
    const coverage = await screen.findByTestId("metric-coverage");
    await waitFor(() => {
      // 7 dimensions of project B average to 0.3638 → 36%.
      expect(within(coverage).getByText("36%")).toBeInTheDocument();
      // Only 应用场景 (0.7) reaches the 0.6 threshold → 1 / 7.
      expect(within(coverage).getByText("核心维度已完成 1 / 7")).toBeInTheDocument();
    });
  });

  it("counts sources, knowledge and pending-review metrics from the fixtures", async () => {
    renderPage();
    const sources = await screen.findByTestId("metric-sources");
    const knowledge = await screen.findByTestId("metric-knowledge");
    const reviews = await screen.findByTestId("metric-reviews");
    await waitFor(() => {
      // 8 revealed sources, 5 with authority ≥ 0.7 and fitness ≥ 0.7.
      expect(within(sources).getByText("8")).toBeInTheDocument();
      expect(within(sources).getByText("高质量 5 个")).toBeInTheDocument();
      // 14 revealed knowledge nodes across 7 distinct types.
      expect(within(knowledge).getByText("14")).toBeInTheDocument();
      expect(within(knowledge).getByText("7 种类型")).toBeInTheDocument();
      // unverified + conflicting claims need review; 1 is conflicting.
      expect(within(reviews).getByText("2")).toBeInTheDocument();
      expect(within(reviews).getByText("1 个存在冲突")).toBeInTheDocument();
    });
  });

  it("shows the project header with the run-state kicker and config action", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "脑机接口康复应用" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/研究项目 \/ 需要审核/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑配置" }),
    ).toBeInTheDocument();
    // The run is parked in NEEDS_REVIEW (terminal) → the primary action is
    // 继续研究; the plan is approved so the button is enabled.
    expect(screen.getByRole("button", { name: "继续研究 →" })).toBeEnabled();
  });

  it("lists research path rows derived from task states", async () => {
    renderPage();
    const path = await screen.findByTestId("overview-path");
    await waitFor(() => {
      // 12 COMPLETED + 1 NEEDS_REVIEW + 1 PENDING.
      expect(path.querySelectorAll('[data-testid="path-row"]').length).toBe(14);
    });
    expect(path.querySelectorAll('[data-state="done"]').length).toBe(12);
    // No RUNNING/PLANNING/VALIDATING tasks in the fixture.
    expect(path.querySelectorAll('[data-state="current"]').length).toBe(0);
    // NEEDS_REVIEW gets the review treatment; PENDING keeps waiting.
    expect(path.querySelectorAll('[data-state="review"]').length).toBe(1);
    expect(path.querySelectorAll('[data-state="waiting"]').length).toBe(1);
    expect(within(path).getAllByText("等待前置任务").length).toBe(1);
    expect(within(path).getByText("待审核")).toBeInTheDocument();
  });

  it("marks the current path step with the pulse ring and progress semantics", async () => {
    // Project B parks in NEEDS_REVIEW with no RUNNING task; promote the
    // PENDING fixture task so a「当前」row exists (reset() re-seeds).
    const stored = mockBackend.storedProjects.find(
      (p) => p.state.project.id === PROJECT_B_ID,
    );
    const pending = stored?.state.tasks.find((t) => t.state === "PENDING");
    expect(pending).toBeDefined();
    if (pending) pending.state = "RUNNING";

    renderPage();
    const path = await screen.findByTestId("overview-path");
    const currentRow = await waitFor(() => {
      const row = path.querySelector<HTMLElement>('[data-state="current"]');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    // Prototype `view-overview`: the current marker carries .pulse.
    const marker = currentRow.querySelector("span[aria-hidden='true']");
    expect(marker).toHaveClass("pulse");
    // The marker is a lucide icon (aria-hidden wrapper around the svg).
    expect(marker?.querySelector("svg")).not.toBeNull();
    // The mini progress bar is exposed to assistive tech; 12/14 → 86%.
    const miniBar = within(currentRow).getByRole("progressbar", {
      name: "任务完成进度",
    });
    expect(miniBar).toHaveAttribute("aria-valuemin", "0");
    expect(miniBar).toHaveAttribute("aria-valuemax", "100");
    expect(miniBar).toHaveAttribute("aria-valuenow", "86");
  });

  it("shows the five most recent activity entries", async () => {
    renderPage();
    const activity = await screen.findByTestId("overview-activity");
    await waitFor(() => {
      expect(activity.querySelectorAll('[data-testid="activity-item"]').length).toBe(5);
    });
    // Newest entry is the run event「12/14 个任务完成，1 项待审核」.
    expect(activity.textContent).toContain("12/14 个任务完成");
    expect(activity.textContent).toContain("实时");
  });

  it("sorts activity newest-first before slicing to five", async () => {
    // The page must not trust query order (spec overview.md: 按 timestamp
    // 倒序取前 5 条): feed deliberately shuffled timestamps and assert the
    // rendered order.
    const entries: TimelineEntry[] = [
      { id: "t1", timestamp: "2026-09-10T09:00:00Z", kind: "run", title: "较早事件", detail: "d" },
      { id: "t2", timestamp: "2026-09-12T11:00:00Z", kind: "source", title: "最新事件", detail: "d" },
      { id: "t3", timestamp: "2026-09-11T10:00:00Z", kind: "claim", title: "中间事件", detail: "d" },
      { id: "t4", timestamp: "2026-09-12T08:00:00Z", kind: "knowledge", title: "次新事件", detail: "d" },
      { id: "t5", timestamp: "2026-09-10T15:00:00Z", kind: "task", title: "较早事件二", detail: "d" },
    ];
    vi.spyOn(timelineService, "get").mockResolvedValue(entries);

    renderPage();
    const activity = await screen.findByTestId("overview-activity");
    await waitFor(() => {
      expect(activity.querySelectorAll('[data-testid="activity-item"]').length).toBe(5);
    });
    const rendered = [
      ...activity.querySelectorAll('[data-testid="activity-item"]'),
    ].map((item) => item.textContent);
    expect(rendered[0]).toContain("最新事件");
    expect(rendered[1]).toContain("次新事件");
    expect(rendered[2]).toContain("中间事件");
    expect(rendered[3]).toContain("较早事件二");
    expect(rendered[4]).toContain("较早事件");
  });

  it("renders dimension coverage bars", async () => {
    renderPage();
    const dims = await screen.findByTestId("overview-dimensions");
    await waitFor(() => {
      expect(dims.textContent).toContain("应用场景");
      expect(dims.textContent).toContain("70%");
      expect(dims.textContent).toContain("未来趋势");
      expect(dims.textContent).toContain("3%");
    });
    // One row per configured dimension (7 for project B).
    expect(dims.querySelectorAll('[data-testid="dimension-row"]').length).toBe(7);
    // RES-10 explainability: each row discloses weighted components + reasons
    // (ported from the former coverage view).
    expect(within(dims).getAllByText("为什么是这个分数？").length).toBe(7);
    expect(within(dims).getAllByText(/3\/5 个任务完成/).length).toBe(1);
  });

  it("exposes progressbar semantics on the metric and dimension bars", async () => {
    renderPage();
    const coverage = await screen.findByTestId("metric-coverage");
    const metricBar = within(coverage).getByRole("progressbar", {
      name: "覆盖度进度",
    });
    expect(metricBar).toHaveAttribute("aria-valuemin", "0");
    expect(metricBar).toHaveAttribute("aria-valuemax", "100");
    // Fixture average 0.3638 → 36%.
    expect(metricBar).toHaveAttribute("aria-valuenow", "36");

    const dims = await screen.findByTestId("overview-dimensions");
    await waitFor(() => {
      expect(
        within(dims).getByRole("progressbar", { name: "应用场景覆盖度进度" }),
      ).toHaveAttribute("aria-valuenow", "70");
    });
    expect(
      within(dims).getByRole("progressbar", { name: "未来趋势覆盖度进度" }),
    ).toHaveAttribute("aria-valuenow", "3");
  });

  it("shows the pending gap proposal and approving it creates a task", async () => {
    const user = userEvent.setup();
    renderPage();

    const next = await screen.findByTestId("overview-next");
    await waitFor(() => {
      // First pending proposal: the 核心概念 dimension (coverage 0.41 < 0.6).
      expect(next.textContent).toContain("低覆盖");
      expect(next.textContent).toContain("核心概念");
    });

    const tasksBefore = mockBackend.handle("task.list", {
      project_id: PROJECT_B_ID,
    }).length;
    expect(tasksBefore).toBe(14);

    await user.click(
      within(next).getByRole("button", { name: "创建研究任务 →" }),
    );

    // Approve goes through the mock backend and creates a real task.
    await waitFor(() => {
      const tasksAfter = mockBackend.handle("task.list", {
        project_id: PROJECT_B_ID,
      });
      expect(tasksAfter.length).toBe(tasksBefore + 1);
    });
    await waitFor(() => {
      expect(within(next).getByText(/已创建任务/)).toBeInTheDocument();
    });
  });

  it("dismisses the top proposal and falls through to the next pending gap", async () => {
    const user = userEvent.setup();
    renderPage();

    const next = await screen.findByTestId("overview-next");
    await waitFor(() => {
      expect(next.textContent).toContain("核心概念");
    });

    await user.click(
      within(next).getByRole("button", { name: "忽略该建议" }),
    );

    // Dismissal goes through the mock backend: the dismissed dimension's
    // proposal disappears and the panel falls through to the next one.
    await waitFor(() => {
      expect(next.textContent).toContain("技术方法");
      expect(
        within(next).getByRole("button", { name: "创建研究任务 →" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps 继续研究 disabled while the plan is a draft", async () => {
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID });
    renderPage();

    const coverage = await screen.findByTestId("metric-coverage");
    await waitFor(() => {
      // Project A never ran: nothing is revealed, coverage is 0%.
      expect(within(coverage).getByText("0%")).toBeInTheDocument();
    });
    const start = screen.getByRole("button", { name: "继续研究 →" });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute("title", "先到研究计划页批准计划");
    // No executed tasks → no gap proposals, the next-step card greys out.
    await waitFor(() => {
      expect(screen.getByTestId("overview-next").textContent).toContain(
        "暂无缺口建议",
      );
    });
  });

  it("shows the guide empty state when no project is active", () => {
    useWorkspaceStore.setState({ activeProjectId: "" });
    renderPage();
    expect(screen.getByTestId("page-empty")).toBeInTheDocument();
    expect(screen.getByText(/选择或创建/)).toBeInTheDocument();
  });
});
