import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { PlanPage } from "./PlanPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Prototype alignment (spec §4, `view-plan`): a four-cell plan summary strip
 * fed by real queries, and a collapsible plan tree. Project B
 * (脑机接口康复应用) pins the numbers: its approved plan has 5 sections with
 * 3+3+3+3+2 = 14 planned tasks, the fixtures reveal 8 sources and 7 configured
 * dimensions, and 1 unverified + 1 conflicting claim await review.
 *
 * Plan review / run interactions stay covered by App.test.tsx (批准计划 /
 * 拒绝计划 / 重新生成 / 开始运行 keep their exact accessible names there).
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
