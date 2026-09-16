import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { TasksPage } from "./TasksPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Prototype alignment (spec §4, `view-tasks`): count tabs (全部/执行中/
 * 待审核/已完成), a task table with status pills, and a per-row action
 * popover. Project B (脑机接口康复应用) pins the numbers: its fixtures seed
 * 14 tasks — 12 COMPLETED, 1 NEEDS_REVIEW (验证论断与证据) and 1 PENDING
 * (综合研究简报) — so 全部 14 / 执行中 1 / 待审核 1 / 已完成 12.
 *
 * Run start gating and the draft-plan empty state stay covered by
 * App.test.tsx (testid `page-empty` and its exact copy).
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <TasksPage projectId={PROJECT_B_ID} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("TasksPage prototype alignment", () => {
  it("renders count tabs derived from the seeded fixtures", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "执行中的工作" });
    expect(screen.getByText("研究任务")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "全部 14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行中 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "待审核 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已完成 12" })).toBeInTheDocument();
    expect(screen.getAllByTestId("task-row")).toHaveLength(14);
  });

  it("labels the filter tab group for assistive technology", async () => {
    renderPage();

    const group = await screen.findByRole("group", { name: "任务状态筛选" });
    expect(
      within(group).getByRole("button", { name: "全部 14" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "已完成 12" }),
    ).toBeInTheDocument();
  });

  it("filters rows when a tab is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByTestId("task-row");
    await user.click(screen.getByRole("button", { name: /待审核/ }));

    await waitFor(() => {
      const rows = screen.getAllByTestId("task-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute("data-state", "NEEDS_REVIEW");
      expect(within(rows[0]).getByText("验证论断与证据")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /已完成/ }));
    await waitFor(() => {
      const rows = screen.getAllByTestId("task-row");
      expect(rows).toHaveLength(12);
      for (const row of rows) {
        expect(row).toHaveAttribute("data-state", "COMPLETED");
      }
    });
  });

  it("shows the status pill text for each seeded state", async () => {
    renderPage();

    const rows = await screen.findAllByTestId("task-row");
    const byTitle = new Map(
      rows.map((row) => [
        within(row).getByTestId("task-title").textContent ?? "",
        row,
      ]),
    );

    const completed = byTitle.get("检索 concepts 维度来源");
    expect(completed).toBeDefined();
    expect(within(completed as HTMLElement).getByText("已完成")).toHaveClass(
      "pill-success",
    );

    const review = byTitle.get("验证论断与证据");
    expect(review).toBeDefined();
    expect(within(review as HTMLElement).getByText("待审核")).toHaveClass(
      "pill-warning",
    );

    const pending = byTitle.get("综合研究简报");
    expect(pending).toBeDefined();
    expect(within(pending as HTMLElement).getByText("等待中")).toHaveClass(
      "pill-neutral",
    );
  });

  it("keeps per-task actions reachable but honestly disabled (V0.1)", async () => {
    const user = userEvent.setup();
    renderPage();

    const rows = await screen.findAllByTestId("task-row");
    const reviewRow = rows.find(
      (row) => row.getAttribute("data-state") === "NEEDS_REVIEW",
    );
    expect(reviewRow).toBeDefined();

    await user.click(
      within(reviewRow as HTMLElement).getByRole("button", {
        name: "任务操作",
      }),
    );
    const panel = await screen.findByTestId("popover-panel");
    // The control stays visible with its label but is disabled and marked:
    // per-task dispatch is ADR-019 phase 2, so V0.1 never pretends it works
    // (audit F6).
    const action = within(panel).getByRole("button", {
      name: /确认并继续/,
    });
    expect(action).toBeDisabled();
    expect(within(panel).getByText("V0.1 暂不支持")).toBeInTheDocument();
    expect(action).toHaveAttribute(
      "title",
      expect.stringContaining("按任务派发"),
    );
  });
});
