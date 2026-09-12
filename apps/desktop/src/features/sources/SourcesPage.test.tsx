import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { SourcesPage } from "./SourcesPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Prototype alignment (spec §4, `view-sources`): a four-cell quality summary
 * strip, a search + type-chip toolbar, and compact prototype source rows.
 *
 * Project B (脑机接口康复应用) pins the numbers from its seeded fixtures:
 * 8 indexed sources — 5 高质量 (authority ≥ 0.7 && fitness ≥ 0.7), 3 中等
 * (quality present but below the bar on one axis), 0 待审核 (discovered
 * without quality) — split into 4 papers, 2 documentation pages and 2 web
 * pages, all on fixtures.example.com.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SourcesPage projectId={PROJECT_B_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

async function findRows() {
  return screen.findAllByTestId("source-row");
}

function rowByTitle(title: string, rows: HTMLElement[]): HTMLElement {
  const row = rows.find((candidate) => within(candidate).queryByText(title) !== null);
  expect(row).toBeDefined();
  return row as HTMLElement;
}

describe("SourcesPage prototype alignment", () => {
  it("renders the quality summary strip with counts derived from the fixtures", async () => {
    renderPage();

    const summary = await screen.findByTestId("source-summary");
    expect(within(summary).getByText("全部")).toBeInTheDocument();
    expect(within(summary).getByText("8")).toBeInTheDocument();
    expect(within(summary).getByText("高质量")).toBeInTheDocument();
    expect(within(summary).getByText("5")).toBeInTheDocument();
    expect(within(summary).getByText("中等")).toBeInTheDocument();
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("待审核")).toBeInTheDocument();
    expect(within(summary).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "已发现的来源" })).toBeInTheDocument();
  });

  it("filters rows through the search box (title or url)", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await findRows()).toHaveLength(8);

    await user.type(screen.getByLabelText("搜索来源或关键词"), "BrainGate");
    await waitFor(() => {
      const rows = screen.getAllByTestId("source-row");
      expect(rows).toHaveLength(1);
      expect(
        within(rows[0]).getByText("BrainGate 开放数据集文档"),
      ).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("搜索来源或关键词"));
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(8);
    });
  });

  it("filters rows through type chips and the quality toggle", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await findRows()).toHaveLength(8);

    await user.click(screen.getByRole("button", { name: "论文" }));
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(4);
    });

    await user.click(screen.getByRole("button", { name: "官方文档" }));
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(2);
    });

    await user.click(screen.getByRole("button", { name: "全部类型" }));
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(8);
    });

    const qualityToggle = screen.getByRole("button", { name: "按质量筛选" });
    await user.click(qualityToggle);
    expect(qualityToggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(5);
    });

    await user.click(qualityToggle);
    await waitFor(() => {
      expect(screen.getAllByTestId("source-row")).toHaveLength(8);
    });
  });

  it("keeps 导入链接 disabled and renders the prototype row anatomy", async () => {
    renderPage();

    const rows = await findRows();
    expect(rows).toHaveLength(8);

    // Paper row: 紫 badge, green 高质量 caption, mono mean score, domain, link.
    const paperRow = rowByTitle(
      "A high-bandwidth neural interface for motor cortex",
      rows,
    );
    expect(within(paperRow).getByText("论文")).toHaveClass(
      "badge-mono",
      "node-badge-alt",
    );
    expect(within(paperRow).getByText("高质量")).toHaveClass("text-success");
    expect(within(paperRow).getByText("0.88")).toBeInTheDocument();
    expect(within(paperRow).getByText("已索引")).toBeInTheDocument();
    expect(within(paperRow).getByText("fixtures.example.com")).toBeInTheDocument();
    const link = within(paperRow).getByRole("link", { name: "打开来源" });
    expect(link).toHaveAttribute(
      "href",
      "https://fixtures.example.com/bci/high-bandwidth-interface",
    );

    // Web page row: 蓝 badge, orange 中等 caption.
    const webRow = rowByTitle("神经康复设备市场观察（博客）", rows);
    expect(within(webRow).getByText("网页")).toHaveClass(
      "badge-mono",
      "node-badge-accent",
    );
    expect(within(webRow).getByText("中等")).toHaveClass("text-warning");

    const importButton = screen.getByRole("button", { name: "导入链接" });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute("title", "桌面版提供");
  });
});
