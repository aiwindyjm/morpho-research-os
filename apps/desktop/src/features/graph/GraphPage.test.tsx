import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { GraphPage } from "./GraphPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { ToastProvider } from "@morpho/ui";

/**
 * Graph view (RES-08, prototype-aligned chrome): fixture graph renders on
 * the dark canvas, type chips narrow it, selection opens the inspector
 * aside, and the accessible list fallback keeps working.
 */

function renderGraph(projectId = PROJECT_B_ID) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <GraphPage projectId={projectId} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("GraphPage", () => {
  it("renders the projected fixture graph with nodes and relations", async () => {
    renderGraph();
    expect(
      await screen.findByRole("heading", { name: "研究关系地图" }),
    ).toBeInTheDocument();
    const canvas = await screen.findByTestId("graph-canvas");
    expect(canvas.parentElement).toHaveClass("graph-canvas-bg");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /运动皮层解码/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("14 节点 · 12 关系")).toBeInTheDocument();
  });

  it("an unrevealed project shows the graph empty state", async () => {
    renderGraph(PROJECT_A_ID);
    expect(await screen.findByTestId("page-empty")).toBeInTheDocument();
    expect(screen.getByText("图谱还没有内容")).toBeInTheDocument();
  });

  it("type chips narrow the graph to the selected node type", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.click(screen.getByRole("button", { name: "论文" }));
    await waitFor(() => {
      expect(screen.getByText(/^2 节点/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "全部节点" }));
    await waitFor(() => {
      expect(screen.getByText("14 节点 · 12 关系")).toBeInTheDocument();
    });
  });

  it("search narrows nodes and updates the count", async () => {
    const user = userEvent.setup();
    renderGraph();
    const search = await screen.findByLabelText("搜索节点");
    await waitFor(async () => {
      expect(await screen.findAllByRole("button", { name: /运动/ }).then((r) => r.length)).toBeGreaterThan(0);
    });
    await user.type(search, "运动皮层");
    await waitFor(() => {
      expect(screen.getByText(/1 节点/)).toBeInTheDocument();
    });
  });

  it("confidence band filter narrows nodes to the selected state", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.selectOptions(screen.getByLabelText("按置信状态过滤"), "confirmed");
    await waitFor(() => {
      expect(screen.getByText("3 节点 · 1 关系")).toBeInTheDocument();
    });
    // Only the three confirmed fixture nodes remain on the canvas.
    expect(screen.queryByRole("button", { name: /运动皮层解码/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /皮层内微电极阵列/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("按置信状态过滤"), "all");
    await waitFor(() => {
      expect(screen.getByText("14 节点 · 12 关系")).toBeInTheDocument();
    });
  });

  it("relation type filter hides edges but keeps the nodes", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.selectOptions(screen.getByLabelText("按关系类型过滤"), "被报道于");
    await waitFor(() => {
      expect(screen.getByText("14 节点 · 1 关系")).toBeInTheDocument();
    });
    // Nodes are unaffected by the edge filter.
    expect(screen.getByRole("button", { name: /运动皮层解码/ })).toBeInTheDocument();
  });

  it("year range filter narrows nodes by their temporal tag", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.selectOptions(screen.getByLabelText("起始年份"), "2026");
    await waitFor(() => {
      expect(screen.getByText("3 节点 · 1 关系")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("起始年份"), "2021");
    await user.selectOptions(screen.getByLabelText("结束年份"), "2021");
    await waitFor(() => {
      expect(screen.getByText("1 节点 · 0 关系")).toBeInTheDocument();
    });
  });

  it("cluster toggle switches the layout mode flag", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByTestId("graph-canvas");
    expect(screen.getByTestId("graph-canvas").parentElement).toHaveAttribute(
      "data-clustered",
      "false",
    );

    const toggle = screen.getByTestId("graph-cluster-toggle");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("graph-canvas").parentElement).toHaveAttribute(
      "data-clustered",
      "true",
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("graph-canvas").parentElement).toHaveAttribute(
      "data-clustered",
      "false",
    );
  });

  it("selecting a node opens the inspector with details and relations", async () => {
    const user = userEvent.setup();
    renderGraph();
    const node = await screen.findByRole("button", { name: /运动皮层解码/ });
    await user.click(node);
    const inspector = await screen.findByTestId("graph-inspector");
    expect(within(inspector).getByText("当前选择")).toBeInTheDocument();
    expect(within(inspector).getByText("运动皮层解码")).toBeInTheDocument();
    expect(
      within(inspector).getByText("从运动皮层神经信号中解码运动意图。"),
    ).toBeInTheDocument();
    expect(within(inspector).getByLabelText("关闭详情")).toBeInTheDocument();
    expect(within(inspector).getByText(/关系（/)).toBeInTheDocument();
    const openMarkdown = within(inspector).getByRole("button", {
      name: "打开 Markdown",
    });
    expect(openMarkdown).toBeDisabled();
    expect(openMarkdown).toHaveAttribute("title", "桌面版提供");
  });

  it("offers an accessible list fallback and keyboard selection", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.click(screen.getByRole("button", { name: /列表视图/ }));
    const table = await screen.findByRole("table", { name: /知识节点列表/ });
    expect(table).toBeInTheDocument();

    const firstRow = screen.getAllByRole("row")[1];
    firstRow.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByTestId("graph-inspector")).toBeInTheDocument();
    });
    // Selected row is marked with aria-current (aria-selected is invalid on
    // a plain <tr> without a grid role).
    expect(firstRow).toHaveAttribute("aria-current", "true");
  });

  it("the list fallback respects the confidence filter and shows the year column", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByRole("button", { name: /运动皮层解码/ });

    await user.selectOptions(screen.getByLabelText("按置信状态过滤"), "confirmed");
    await user.click(screen.getByRole("button", { name: /列表视图/ }));
    const table = await screen.findByRole("table", { name: /知识节点列表/ });
    // Header row + the three confirmed fixture nodes.
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("2023");
    expect(within(table).queryByText("运动皮层解码")).not.toBeInTheDocument();
  });
});
