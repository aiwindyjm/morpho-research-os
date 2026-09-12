import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";
import { ConfigPage } from "./ConfigPage";
import { mockBackend } from "@/services/mocks/backend";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Prototype alignment (spec §6.2): the research config page renders as one
 * panel with four numbered sections (01 研究主题 / 02 研究范围 /
 * 03 研究维度 / 04 来源偏好). Project B is the fixture with a fully
 * populated ResearchConfig; the save/isolation flow is covered by
 * App.test.tsx and must keep passing unchanged.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ConfigPage projectId={PROJECT_B_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBackend.reset();
  useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
});

describe("ConfigPage (prototype numbered sections)", () => {
  it("renders numbered prototype sections with the fixture topic", async () => {
    renderPage();
    const topic = await screen.findByLabelText(/研究主题/);
    expect(topic).toHaveValue("脑机接口在运动康复中的应用");
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
  });

  it("exposes the segmented depth control as a named group", async () => {
    renderPage();
    await screen.findByLabelText(/研究主题/);
    expect(screen.getByRole("group", { name: "研究深度" })).toBeInTheDocument();
    expect(screen.getByLabelText(/研究深度/)).toBeInTheDocument();
  });

  it("renders the custom-dimension chip as a desktop-only stub", async () => {
    renderPage();
    await screen.findByLabelText(/研究主题/);
    const addChip = screen.getByRole("button", { name: "＋ 自定义维度" });
    expect(addChip).toBeDisabled();
    expect(addChip).toHaveAttribute("title", "桌面版提供");
  });
});
