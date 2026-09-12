import { expect, test } from "@playwright/test";
import { openView, switchToProject } from "./support";

/**
 * Project isolation states: switching the active project swaps every query
 * key and the assistant context (projects are isolation boundaries, PRD §3),
 * and the draft-stage fixture (大语言模型推理优化 — draft plan, nothing
 * revealed) shows the honest plan-gated/empty states on results views.
 */

test.describe("project switch and empty states", () => {
  test("switching projects swaps the assistant context strip and topbar", async ({
    page,
  }) => {
    await page.goto("/");

    // The completed fixture is active on load.
    await expect(page.getByTestId("topbar")).toContainText("脑机接口康复应用");

    // The assistant stays docked across the switch and re-anchors.
    await page.getByRole("button", { name: "打开 AI 助手" }).click();
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    const contextStrip = panel.getByText("正在使用").locator("..");
    await expect(contextStrip).toContainText("脑机接口康复应用");

    // Switch through the project switcher — the isolation boundary users touch.
    await switchToProject(page, "大语言模型推理优化");

    await expect(page.getByTestId("topbar")).toContainText("大语言模型推理优化");
    await expect(contextStrip).toContainText("大语言模型推理优化");
  });

  test("the draft-stage fixture shows plan-gated tasks and an empty graph", async ({
    page,
  }) => {
    await page.goto("/");
    await switchToProject(page, "大语言模型推理优化");

    // Tasks: no run exists yet — the view gates on plan approval.
    await openView(page, "任务");
    await expect(page.getByTestId("page-empty")).toBeVisible();
    await expect(
      page.getByText(/先到「研究计划」页审查并批准计划/),
    ).toBeVisible();

    // Graph: nothing revealed for this project yet.
    await openView(page, "图谱");
    await expect(page.getByTestId("page-empty")).toBeVisible();
    await expect(page.getByText("图谱还没有内容")).toBeVisible();
  });
});
