import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { GapsPage } from "./GapsPage";
import { ToastProvider } from "@morpho/ui";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { GAP_COVERAGE_THRESHOLD } from "@/types/domain";

/**
 * Coverage & Gaps view (RES-10): the formula components are displayed per
 * dimension with raw inputs, and gap proposals require explicit approval.
 */

function renderGaps(projectId = PROJECT_B_ID) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <GapsPage projectId={projectId} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("GapsPage", () => {
  it("shows overall coverage, per-dimension panels, and raw inputs", async () => {
    renderGaps();
    expect(
      await screen.findByRole("heading", { name: "覆盖与缺口" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByTestId("coverage-panel").length).toBeGreaterThan(0);
    });

    // Formula is shown, not hidden behind a magic number.
    expect(screen.getByText(/公式：任务完成度 0\.4/)).toBeInTheDocument();

    const concepts = screen
      .getAllByTestId("coverage-panel")
      .find((panel) => panel.textContent?.includes("核心概念"));
    expect(concepts).toBeDefined();
    expect(within(concepts!).getByText(/3\/5 个任务完成/)).toBeInTheDocument();
  });

  it("gap proposals stay read-only until approved, then create a task", async () => {
    const user = userEvent.setup();
    renderGaps();

    const gapCards = await screen.findAllByTestId("gap-card");
    expect(gapCards.length).toBeGreaterThan(0);
    const gapCard = gapCards[0];
    expect(
      within(gapCard).getByText(/建议保持只读；只有你批准后才会创建任务/),
    ).toBeInTheDocument();

    const tasksBefore = mockBackend.handle("task.list", {
      project_id: PROJECT_B_ID,
    }).length;
    expect(tasksBefore).toBe(14);

    await user.click(
      within(gapCard).getByRole("button", { name: "批准并创建任务" }),
    );

    await waitFor(() => {
      const tasksAfter = mockBackend.handle("task.list", {
        project_id: PROJECT_B_ID,
      });
      expect(tasksAfter.length).toBe(tasksBefore + 1);
    });
    await waitFor(() => {
      expect(within(gapCard).getByText(/已按建议创建任务/))
        .toBeInTheDocument();
    });
  });

  it("documents the documented threshold in the rule text", async () => {
    renderGaps();
    await screen.findByRole("heading", { name: "研究缺口" });
    await waitFor(() => {
      expect(
        screen.getAllByText(new RegExp(String(GAP_COVERAGE_THRESHOLD))).length,
      ).toBeGreaterThan(0);
    });
  });
});
