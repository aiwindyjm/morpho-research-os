import { expect, test } from "@playwright/test";
import { openView, switchToProject, switchViewViaStore } from "./support";

/**
 * PRD §4 first journey through the deterministic mock fixtures (PRD §16:
 * E2E runs against mock workers and providers — the default mock transport,
 * never a real provider).
 *
 * The mock backend seeds two projects; `project.list` sorts by created_at, so
 * the app auto-selects 脑机接口康复应用 (created 2026-05-10, approved plan +
 * completed run + revealed knowledge) over the draft-stage fixture
 * 大语言模型推理优化 (created 2026-06-01). The results legs of the journey
 * therefore run on the completed fixture, while plan approval and the run
 * start run on the draft fixture — exactly the two states the mock data pins.
 */

test.describe("first research journey (mock backend)", () => {
  test("opens on the projects view with both seeded projects and the completed fixture active", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "所有研究项目" }),
    ).toBeVisible();
    await expect(page.getByTestId("project-card")).toHaveCount(2);

    // ProjectBootstrap selects the first project from project.list.
    await expect(page.getByTestId("topbar")).toContainText("脑机接口康复应用");
    // The contextual assistant anchors to the active project.
    await expect(
      page.getByRole("button", { name: "打开 AI 助手" }),
    ).toBeVisible();
  });

  test("research config renders the active project's depth and dimensions", async ({
    page,
  }) => {
    await page.goto("/");
    await openView(page, "研究配置");

    // 01 研究主题 section: fixture B's topic.
    const topic = page.getByLabel(/研究主题/);
    await expect(topic).toHaveValue("脑机接口在运动康复中的应用");

    // 02 研究范围: depth SegmentedControl radiogroup; 03/04 sections render.
    await expect(page.getByRole("radiogroup", { name: "研究深度" })).toBeVisible();
    await expect(page.getByText("01", { exact: true })).toBeVisible();
    await expect(page.getByText("04", { exact: true })).toBeVisible();

    // Dimension chips use the shared Chinese dimension labels.
    await expect(page.getByText("核心概念")).toBeVisible();
    await expect(page.getByText("未来趋势")).toBeVisible();
  });

  test("draft plan renders its tree, can be approved, and starts a run", async ({
    page,
  }) => {
    await page.goto("/");
    await switchToProject(page, "大语言模型推理优化");
    await openView(page, "研究计划");

    await expect(page.getByRole("heading", { name: "研究计划" })).toBeVisible();
    const tree = page.getByTestId("plan-tree");
    await expect(tree).toBeVisible();
    // Generated plan: one section per dimension plus 交叉验证与综合.
    await expect(tree.getByText("concepts 维度研究")).toBeVisible();
    await expect(tree.getByText("交叉验证与综合")).toBeVisible();
    await expect(tree.getByText("验证论断与证据").first()).toBeVisible();

    // Approve the draft (aria-label 批准计划, visible text 确认并开始).
    await page.getByRole("button", { name: "批准计划" }).click();
    await expect(page.getByText("已批准").first()).toBeVisible();

    // Start the run — the tasks view then shows the created task DAG.
    await page.getByRole("button", { name: "开始运行" }).click();
    await openView(page, "任务");
    await expect(
      page.getByRole("heading", { name: "执行中的工作" }),
    ).toBeVisible();
    // 6 dimensions × 3 tasks + 2 synthesis tasks = 20 planned tasks.
    await expect(
      page.getByRole("button", { name: "全部 20" }),
    ).toBeVisible();
    await expect(page.getByTestId("task-row")).toHaveCount(20);
    await expect(page.getByText(/运行状态/).first()).toBeVisible();
  });

  test("sources view lists the revealed fixture sources", async ({ page }) => {
    await page.goto("/");
    await openView(page, "来源");

    await expect(
      page.getByRole("heading", { name: "已发现的来源" }),
    ).toBeVisible();
    const summary = page.getByTestId("source-summary");
    await expect(summary).toBeVisible();
    await expect(summary.getByText("8", { exact: true })).toBeVisible();
    await expect(page.getByTestId("source-row")).toHaveCount(8);
  });

  test("knowledge view renders cards and the claims tab with evidence", async ({
    page,
  }) => {
    await page.goto("/");
    await openView(page, "知识");

    await expect(
      page.getByRole("heading", { name: "已提取的知识" }),
    ).toBeVisible();
    // 14 fixture nodes: 13 regular cards + 1 conflicting card.
    await expect(page.getByTestId("knowledge-card")).toHaveCount(13);
    await expect(page.getByTestId("knowledge-card-conflict")).toHaveCount(1);
    await expect(
      page.getByTestId("knowledge-card-conflict"),
    ).toContainText("消费级神经数据隐私争议");

    // Claims stay separate records with their own tab.
    await page.getByRole("tab", { name: "论断与证据" }).click();
    await expect(page.getByTestId("claim-card")).toHaveCount(8);
    await expect(
      page.getByText("存在冲突：支持与反驳证据均已保留").first(),
    ).toBeVisible();
  });

  test("graph renders and selecting a node opens the inspector", async ({
    page,
  }) => {
    await page.goto("/");
    await openView(page, "图谱");

    await expect(
      page.getByRole("heading", { name: "研究关系地图" }),
    ).toBeVisible();
    await expect(page.getByText("14 节点 · 12 关系")).toBeVisible();

    const node = page.getByRole("button", { name: /运动皮层解码/ });
    await expect(node).toBeVisible();
    await node.click();

    const inspector = page.getByTestId("graph-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("当前选择")).toBeVisible();
    await expect(inspector.getByText("运动皮层解码")).toBeVisible();
    await expect(
      inspector.getByText("从运动皮层神经信号中解码运动意图。"),
    ).toBeVisible();
  });

  test("reports view renders the summary derived from the mock data", async ({
    page,
  }) => {
    await page.goto("/");
    // 报告 is registered in the view registry but not yet exposed in the
    // sidebar (ADR-013); switch through the same store the UI uses.
    await switchViewViaStore(page, "reports");

    await expect(
      page.getByRole("heading", { name: "项目研究简报" }),
    ).toBeVisible();
    const summary = page.getByTestId("report-summary");
    await expect(summary).toBeVisible();
    await expect(summary.getByTestId("report-metric-sources")).toContainText("8");
    await expect(summary.getByTestId("report-metric-knowledge")).toContainText(
      "14",
    );
    await expect(summary.getByTestId("report-metric-claims")).toContainText("8");
    await expect(summary.getByTestId("report-metric-coverage")).toContainText(
      "36%",
    );
    await expect(page.getByTestId("report-dimension-row")).toHaveCount(7);
  });
});
