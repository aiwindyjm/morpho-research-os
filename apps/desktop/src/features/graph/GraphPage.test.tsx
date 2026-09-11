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
 * Graph view (RES-08): fixture graph renders, search/filters narrow it,
 * selection opens the inspector, and the accessible list fallback works.
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
    expect(await screen.findByRole("heading", { name: "图谱" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /运动皮层解码/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("14 节点 / 12 关系")).toBeInTheDocument();
  });

  it("an unrevealed project shows the graph empty state", async () => {
    renderGraph(PROJECT_A_ID);
    expect(await screen.findByTestId("page-empty")).toBeInTheDocument();
    expect(screen.getByText("图谱还没有内容")).toBeInTheDocument();
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

  it("selecting a node opens the inspector with details and relations", async () => {
    const user = userEvent.setup();
    renderGraph();
    const node = await screen.findByRole("button", { name: /运动皮层解码/ });
    await user.click(node);
    const inspector = await screen.findByTestId("graph-inspector");
    expect(within(inspector).getByText("运动皮层解码")).toBeInTheDocument();
    expect(within(inspector).getByLabelText("关闭详情")).toBeInTheDocument();
    expect(within(inspector).getByText(/关系（/)).toBeInTheDocument();
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
  });
});
