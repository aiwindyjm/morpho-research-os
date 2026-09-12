import { expect, test } from "@playwright/test";
import { openView } from "./support";

/**
 * Journal save flow (PRD §12, DO_NOT_BREAK #12): the assistant records a
 * conversation, and 保存对话到日志 is an explicit two-step action — only
 * 确认保存 writes the transcript into the local (browser localStorage)
 * journal store that the 对话日志 view reads. Nothing is captured silently.
 */

test.describe("assistant conversation → journal", () => {
  test("two-step save writes the transcript and the journal shows it", async ({
    page,
  }) => {
    await page.goto("/");

    // Open the assistant panel anchored to the active fixture project.
    await page.getByRole("button", { name: "打开 AI 助手" }).click();
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    const contextStrip = panel.getByText("正在使用").locator("..");
    await expect(contextStrip).toContainText("脑机接口康复应用");

    // Produce a conversation (user action + assistant response = 2 messages).
    await panel.getByRole("button", { name: "解释进度" }).click();
    const response = page.getByTestId("assistant-response");
    await expect(response).toBeVisible();
    await expect(response).toContainText("脑机接口康复应用");

    // Step 1: 保存到日志 arms the confirmation.
    const saveCard = page.getByTestId("assistant-journal-save");
    await expect(saveCard.getByText("当前对话共 2 条消息")).toBeVisible();
    await saveCard.getByRole("button", { name: "保存到日志" }).click();
    const confirmGroup = saveCard.getByRole("group", { name: "确认保存对话" });
    await expect(confirmGroup).toBeVisible();
    await expect(
      confirmGroup.getByText(/将把 2 条消息保存到今天的对话日志/),
    ).toBeVisible();

    // Step 2: 确认保存 actually writes the entry.
    await saveCard.getByRole("button", { name: "确认保存" }).click();
    await expect(
      saveCard.getByText(/已保存 2 条消息到今天的对话日志/),
    ).toBeVisible();

    // The journal view lists the saved transcript (fresh browser context,
    // so this is the first entry of today).
    await openView(page, "对话日志");
    await expect(
      page.getByRole("heading", { name: "对话日志" }),
    ).toBeVisible();
    const list = page.getByTestId("journal-list");
    await expect(list).toContainText(/从 AI 助手保存的对话（项目：脑机接口康复应用/);
    await expect(list).toContainText("[用户] 解释进度");
    await expect(page.getByTestId("journal-count")).toHaveText(/1 条记录/);
  });
});
