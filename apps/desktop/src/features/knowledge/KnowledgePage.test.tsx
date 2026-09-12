import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { KnowledgePage } from "./KnowledgePage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * Prototype alignment (spec §4, `view-knowledge`): knowledge cards in a
 * four-column grid with mono type badges, confidence captions, and conflict
 * styling. Project B seeds 14 nodes — 4 概念, 3 技术, 2 论文, 2 应用,
 * 1 公司, 1 事件, 1 争议 — and exactly one conflicting node
 * (消费级神经数据隐私争议). The 论断与证据 tab keeps its claim/evidence
 * interactions (8 claims, 1 conflicting) covered here as a regression guard.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <KnowledgePage projectId={PROJECT_B_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
});

describe("KnowledgePage prototype alignment", () => {
  it("renders knowledge cards with prototype type badges from the fixtures", async () => {
    renderPage();

    // 14 nodes total: 13 regular cards + 1 conflict card (separate testid).
    const cards = await screen.findAllByTestId("knowledge-card");
    expect(cards).toHaveLength(13);
    expect(screen.getAllByTestId("knowledge-card-conflict")).toHaveLength(1);

    const conceptCards = cards.filter(
      (card) => within(card).queryByText("概念") !== null,
    );
    expect(conceptCards).toHaveLength(4);

    const techCard = cards.find(
      (card) => within(card).queryByText("皮层内微电极阵列") !== null,
    );
    expect(techCard).toBeDefined();
    expect(within(techCard as HTMLElement).getByText("技术")).toHaveClass(
      "badge-mono",
      "node-badge-alt",
    );
  });

  it("marks the conflicting node card with the prototype conflict styling", async () => {
    renderPage();

    const conflictCard = await screen.findByTestId("knowledge-card-conflict");
    expect(conflictCard).toHaveClass("card-active-error");
    expect(
      within(conflictCard).getByText("消费级神经数据隐私争议"),
    ).toBeInTheDocument();
    expect(within(conflictCard).getByText("争议")).toHaveClass(
      "badge-mono",
      "node-badge-error",
    );
    expect(within(conflictCard).getByText("存在冲突")).toHaveClass("text-error");
  });

  it("keeps 导出 Vault disabled and filters cards through the type select", async () => {
    const user = userEvent.setup();
    renderPage();

    const exportButton = await screen.findByRole("button", { name: "导出 Vault" });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("title", "桌面版提供");

    await screen.findAllByTestId("knowledge-card");
    await user.selectOptions(screen.getByLabelText("筛选类型"), "Controversy");
    await waitFor(() => {
      expect(screen.getAllByTestId("knowledge-card-conflict")).toHaveLength(1);
      expect(screen.queryByTestId("knowledge-card")).not.toBeInTheDocument();
    });
  });

  it("keeps the claims tab with its conflicting-claim evidence flow", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByTestId("knowledge-card");
    await user.click(screen.getByRole("tab", { name: "论断与证据" }));

    const claimCards = await screen.findAllByTestId("claim-card");
    expect(claimCards).toHaveLength(8);
    expect(
      screen.getByText("存在冲突：支持与反驳证据均已保留"),
    ).toBeInTheDocument();
  });
});
