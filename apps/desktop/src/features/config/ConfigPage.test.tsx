import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("accepts keystroke-by-keystroke typing in the from-year field", async () => {
    const user = userEvent.setup();
    renderPage();
    const fromYear = await screen.findByLabelText("开始年份");
    expect(fromYear).toHaveValue(2021);

    await user.clear(fromYear);
    // Regression guard: Date.UTC remaps years 0–99 to 1900+y, so an
    // unbuffered controlled input used to turn the first "2" into "1902".
    await user.type(fromYear, "2");
    expect(fromYear).toHaveValue(2);

    await user.type(fromYear, "015");
    expect(fromYear).toHaveValue(2015);
  });

  it("saves a fully typed year as the ISO start of that year", async () => {
    const user = userEvent.setup();
    renderPage();
    const fromYear = await screen.findByLabelText("开始年份");

    await user.clear(fromYear);
    await user.type(fromYear, "2015");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // The mutation resolves asynchronously; wait until the mock backend
    // actually persisted the new value.
    await waitFor(() => {
      const stored = mockBackend.handle("config.get", {
        project_id: PROJECT_B_ID,
      });
      expect(stored.time_range.from).toBe("2015-01-01T00:00:00.000Z");
    });
  });

  it("放弃修改 discards the draft and restores the last-saved server values", async () => {
    const user = userEvent.setup();
    renderPage();
    const topic = await screen.findByLabelText(/研究主题/);
    const discard = screen.getByRole("button", { name: "放弃修改" });
    // Without a local draft the discard action is unavailable.
    expect(discard).toBeDisabled();

    await user.type(topic, "（草稿）");
    expect(topic).toHaveValue("脑机接口在运动康复中的应用（草稿）");
    expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled();

    await user.click(discard);
    // Fields fall back to the saved server values and the draft is cleared
    // (save and discard return to their disabled, clean state).
    expect(topic).toHaveValue("脑机接口在运动康复中的应用");
    expect(discard).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
  });
});
