import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { ReportsPage } from "./ReportsPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Reports view (PRD §13 minimal first cut): the summary is derived from the
 * existing mock queries — project B pins 8 revealed sources, 14 knowledge
 * nodes, 8 claims, 36% overall coverage across 7 configured dimensions, and
 * the 4 seeded run events. Project A has no revealed content, so the page
 * shows its empty state; the export stays an honest disabled placeholder.
 */

function renderPage(projectId = PROJECT_B_ID) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ReportsPage projectId={projectId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("ReportsPage", () => {
  it("shows the loading state before the queries resolve", () => {
    renderPage();
    expect(screen.getByTestId("page-loading")).toBeInTheDocument();
  });

  it("renders the summary from the mock data", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "项目研究简报" }),
    ).toBeInTheDocument();

    const summary = await screen.findByTestId("report-summary");
    await waitFor(() => {
      expect(within(summary).getByTestId("report-metric-sources")).toHaveTextContent("8");
      expect(within(summary).getByTestId("report-metric-knowledge")).toHaveTextContent("14");
      expect(within(summary).getByTestId("report-metric-claims")).toHaveTextContent("8");
      expect(within(summary).getByTestId("report-metric-coverage")).toHaveTextContent("36%");
    });

    // 7 configured dimensions with the explainable coverage columns.
    const dimensions = await screen.findByTestId("report-dimensions");
    await waitFor(() => {
      expect(
        within(dimensions).getAllByTestId("report-dimension-row"),
      ).toHaveLength(7);
    });

    // The seeded run events appear as recent runs.
    const runs = screen.getByTestId("report-recent-runs");
    expect(within(runs).getAllByTestId("report-run-event")).toHaveLength(4);
    expect(within(runs).getByText(/12\/14 个任务完成/)).toBeInTheDocument();
  });

  it("shows the empty state for a project without research content", async () => {
    renderPage(PROJECT_A_ID);
    expect(await screen.findByTestId("page-empty")).toBeInTheDocument();
    expect(screen.getByText("报告还没有内容")).toBeInTheDocument();
  });

  it("surfaces query errors through the page error state with retry", async () => {
    // Non-retryable so the single armed fault surfaces instead of being
    // retried (the query client retries retryable errors once).
    mockBackend.armFault({
      command: "source.list",
      payload: { retryable: false },
    });
    renderPage();

    expect(await screen.findByTestId("page-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("keeps the export section as an explicitly disabled placeholder", async () => {
    renderPage();
    const exportSection = await screen.findByTestId("report-export");
    expect(within(exportSection).getByText("即将提供")).toBeInTheDocument();
    const exportButton = within(exportSection).getByRole("button", {
      name: "导出报告",
    });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("title", "即将提供");
    await userEvent.setup().click(exportButton); // still disabled, no throw
  });
});
