import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { PlanPage } from "./PlanPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Prototype alignment (spec §4, `view-plan`): a four-cell plan summary strip
 * fed by real queries, and a collapsible plan tree. Project B
 * (脑机接口康复应用) pins the numbers: its approved plan has 5 sections with
 * 3+3+3+3+2 = 14 planned tasks, the fixtures reveal 8 sources and 7 configured
 * dimensions, and 1 unverified + 1 conflicting claim await review.
 *
 * Plan review / run interactions stay covered by App.test.tsx (批准计划 /
 * 开始运行 keep their exact accessible names there). The plan-regeneration
 * review flow (重新生成 / 拒绝计划 / 编辑任务) is pinned here on Project A
 * (draft plan, no run) — the interactions the desktop transport now serves
 * through plan_regenerate / plan_reject / plan_update_task (ADR-020).
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <PlanPage projectId={PROJECT_B_ID} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderDraftPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <PlanPage projectId={PROJECT_A_ID} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("PlanPage prototype alignment", () => {
  it("renders the plan summary strip with four stat cells from the fixtures", async () => {
    renderPage();
    const summary = await screen.findByTestId("plan-summary");

    expect(within(summary).getByText("预计任务")).toBeInTheDocument();
    expect(within(summary).getByText("14")).toBeInTheDocument();
    expect(within(summary).getByText("来源")).toBeInTheDocument();
    expect(within(summary).getByText("8")).toBeInTheDocument();
    expect(within(summary).getByText("研究维度")).toBeInTheDocument();
    expect(within(summary).getByText("7")).toBeInTheDocument();
    expect(within(summary).getByText("需要审核")).toBeInTheDocument();
    expect(within(summary).getByText("2")).toBeInTheDocument();
  });

  it("collapses a plan group and hides its task rows", async () => {
    const user = userEvent.setup();
    renderPage();

    const tree = await screen.findByTestId("plan-tree");
    await waitFor(() => {
      expect(within(tree).getAllByRole("button", { name: "折叠分组" }).length).toBe(5);
    });
    expect(within(tree).getByText("检索concepts维度来源")).toBeInTheDocument();

    const collapseButton = within(tree).getAllByRole("button", { name: "折叠分组" })[0];
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    await user.click(collapseButton);

    expect(within(tree).queryByText("检索concepts维度来源")).not.toBeInTheDocument();
    expect(
      within(tree).getByRole("button", { name: "展开分组" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("PlanPage plan-review interactions (desktop-wired commands)", () => {
  // Explicit timeout: this test chains three mutation-driven refreshes, and
  // under parallel full-suite load the mock round-trips alone can exceed
  // vitest's 5s default (observed 5-12s in the 2026-09-16 full runs while
  // the same test passes in ~1s standalone). The assertions themselves are
  // unchanged.
  it(
    "rejects the draft plan, then regenerates a fresh editable draft",
    async () => {
      const user = userEvent.setup();
      renderDraftPage();

    // Draft state: the review trio plus per-task edit actions.
    expect(await screen.findByRole("button", { name: "拒绝计划" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "编辑任务" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "拒绝计划" }));

    // Rejected: editing closes and the only action is a fresh generation.
    // Mutation-driven refresh: under parallel full-suite load the mock
    // round-trip + refetch can exceed waitFor's 1s default (observed ~3s in
    // the 2026-09-16 full run), so the waits are explicitly generous.
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "重新生成计划" })).toBeInTheDocument();
      },
      { timeout: 8_000 },
    );
    expect(screen.queryByRole("button", { name: "拒绝计划" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑任务" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新生成计划" }));

    // The regenerated plan is a draft again with editable tasks.
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
      },
      { timeout: 8_000 },
    );
    expect(screen.getAllByRole("button", { name: "编辑任务" }).length).toBeGreaterThan(0);
  },
  20_000,
  );

  it("edits a draft task's title and description through the dialog", async () => {
    const user = userEvent.setup();
    renderDraftPage();

    await screen.findByRole("button", { name: "拒绝计划" });
    const firstTask = "检索 concepts 维度来源";
    expect(screen.getByText(firstTask)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "编辑任务" })[0]);
    const titleInput = screen.getByLabelText("任务标题");
    const descriptionInput = screen.getByLabelText("任务描述");
    expect(titleInput).toHaveValue(firstTask);

    await user.clear(titleInput);
    await user.type(titleInput, "聚焦量化方案的检索");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "只检索量化相关的来源。");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(screen.getByText("聚焦量化方案的检索")).toBeInTheDocument();
    });
    expect(screen.queryByText(firstTask)).not.toBeInTheDocument();
  });
});
