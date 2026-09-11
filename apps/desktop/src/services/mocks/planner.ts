import type { ResearchConfig, ResearchPlan } from "@/types/domain";
import { nextUuid } from "./ids";

/**
 * Mock planner: turns a ResearchConfig into a reviewable ResearchPlan
 * draft (RES-01). It only ever produces a draft — nothing executes until
 * the user approves. The real planner lives in the Python worker; this
 * deterministic stand-in exists for offline UI development and tests.
 */

export function generatePlanForConfig(
  projectId: string,
  config: ResearchConfig,
  timestamp: string,
): ResearchPlan {
  const dimensionCount = Math.min(config.dimensions.length, config.depth + 3);
  const dimensions = config.dimensions.slice(0, dimensionCount);

  const sections: ResearchPlan["sections"] = dimensions.map((dimension) => ({
    id: nextUuid(),
    title: dimensionSectionTitle(dimension),
    dimension,
    rationale: `为「${dimension}」维度建立独立来源与知识节点。`,
    objectives: [
      "收集不少于三个独立来源",
      "识别该维度的核心对象与关系",
      "为关键结论保留证据定位",
    ],
    tasks: [
      {
        id: nextUuid(),
        title: `检索 ${dimension} 维度来源`,
        description: "检索候选来源，记录 URL、类型与检索时间。",
        kind: "search" as const,
      },
      {
        id: nextUuid(),
        title: `提取并评估 ${dimension} 维度内容`,
        description: "提取正文与元数据，生成来源质量评估。",
        kind: "source_evaluation" as const,
      },
      {
        id: nextUuid(),
        title: `归一化 ${dimension} 维度知识`,
        description: "生成实体、关系与候选论断，保留出处。",
        kind: "normalization" as const,
      },
    ],
  }));

  sections.push({
    id: nextUuid(),
    title: "交叉验证与综合",
    dimension: dimensions[0] ?? "concepts",
    rationale: "对全部维度的结果执行冲突检测并输出综合摘要。",
    objectives: ["检测相互矛盾的论断并保留双方证据", "输出本轮研究综合摘要"],
    tasks: [
      {
        id: nextUuid(),
        title: "验证论断与证据",
        description: "校验证据定位与置信度，标记冲突项进入审核。",
        kind: "validation" as const,
      },
      {
        id: nextUuid(),
        title: "综合研究简报",
        description: "汇总本轮研究结论、待审核项与下一步建议。",
        kind: "synthesis" as const,
      },
    ],
  });

  return {
    id: nextUuid(),
    project_id: projectId,
    title: `${config.topic} · 研究计划`,
    status: "draft",
    rationale: `按 ${config.dimensions.length} 个研究维度、深度 ${config.depth} 组织检索与提取；批准后将创建可恢复的任务 DAG。`,
    sections,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function dimensionSectionTitle(dimension: string): string {
  return `${dimension} 维度研究`;
}
