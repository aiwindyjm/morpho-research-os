import { useState } from "react";
import { Alert, Badge, Button, Card, Textarea } from "@morpho/ui";
import {
  ASSISTANT_ACTION_LABELS,
  PLAN_STATUS_LABELS,
} from "@/types/labels";
import type { AssistantAction, AssistantResponse } from "@/types/domain";
import {
  useAssistantActions,
  useAssistantContext,
  useAssistantDecisions,
} from "@/services/queries";
import { isMorphoError } from "@/services/errors";

/**
 * Contextual AI Assistant (docs/PRD.md §12, UI-05): anchored to the active
 * project, showing research context, with exactly four first-round actions.
 * Recording a decision requires an explicit save; nothing is persisted
 * automatically, and switching projects swaps the whole context.
 */

const CONTEXT_ACTIONS: Array<{
  action: "explain_progress" | "suggest_next_task" | "list_pending_reviews";
}> = [
  { action: "explain_progress" },
  { action: "suggest_next_task" },
  { action: "list_pending_reviews" },
];

export function AssistantPanel() {
  const projectId = useWorkspaceProjectId();
  const { data: context, isLoading } = useAssistantContext(projectId);
  const { data: decisions } = useAssistantDecisions(projectId);
  const { act, saveDecision } = useAssistantActions(projectId);

  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [decisionDraft, setDecisionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  async function runAction(action: AssistantAction) {
    setError(null);
    setSavedNotice(false);
    try {
      if (action === "record_decision") {
        if (!decisionDraft.trim()) {
          setError("请先写下要保存的决定内容。");
          return;
        }
        await saveDecision.mutateAsync(decisionDraft.trim());
        setDecisionDraft("");
        setSavedNotice(true);
        setResponse(null);
        return;
      }
      const result = await act.mutateAsync(action);
      setResponse(result);
    } catch (err) {
      setError(
        isMorphoError(err) ? err.userMessage : "助手暂时不可用，请重试。",
      );
    }
  }

  return (
    <section
      aria-label="AI 研究助手"
      className="flex h-full flex-col gap-md overflow-y-auto p-md"
      data-testid="assistant-panel"
    >
      <header>
        <h2 className="text-h3 text-text-primary">AI 研究助手</h2>
        <p className="text-caption text-text-muted">绑定当前项目，不跨项目共享上下文</p>
      </header>

      {isLoading ? (
        <p className="text-caption text-text-muted" role="status">
          正在加载项目上下文…
        </p>
      ) : context ? (
        <Card className="flex flex-col gap-xs">
          <p className="text-label text-text-primary">{context.project_name}</p>
          <p className="text-caption text-text-secondary">主题：{context.topic}</p>
          <div className="mt-xs flex flex-wrap items-center gap-xs">
            {context.plan_status === "none" ? (
              <Badge variant="warning">未生成计划</Badge>
            ) : (
              <Badge variant="neutral">
                计划：{PLAN_STATUS_LABELS[context.plan_status]}
              </Badge>
            )}
            <Badge variant="neutral">
              任务 {context.tasks_completed}/{context.tasks_total}
            </Badge>
            {context.pending_reviews > 0 ? (
              <Badge variant="warning">{context.pending_reviews} 待审核</Badge>
            ) : null}
          </div>
        </Card>
      ) : null}

      <nav aria-label="助手动作" className="flex flex-col gap-xs">
        {CONTEXT_ACTIONS.map(({ action }) => (
          <Button
            key={action}
            size="sm"
            variant="secondary"
            onClick={() => void runAction(action)}
            loading={act.isPending && act.variables === action}
          >
            {ASSISTANT_ACTION_LABELS[action]}
          </Button>
        ))}
      </nav>

      {error ? (
        <Alert variant="error" title="操作未完成">
          {error}
        </Alert>
      ) : null}

      {response ? (
        <Card className="flex flex-col gap-sm" data-testid="assistant-response">
          <p className="text-body text-text-primary">{response.summary}</p>
          {response.items.length > 0 ? (
            <ul className="flex flex-col gap-xs">
              {response.items.map((item, index) => (
                <li key={`${item.label}-${index}`} className="text-caption text-text-secondary">
                  <span className="text-text-primary">{item.label}</span>
                  {item.detail ? ` — ${item.detail}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-sm">
        <p className="text-label text-text-primary">记录决定</p>
        <p className="text-caption text-text-muted">
          决定只在本项目内保存；点击「保存决定」才会写入。
        </p>
        <Textarea
          aria-label="决定内容"
          placeholder="例如：下一轮优先补充量化方向的论文来源"
          value={decisionDraft}
          onChange={(e) => setDecisionDraft(e.target.value)}
          rows={3}
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => void runAction("record_decision")}
          loading={saveDecision.isPending}
        >
          保存决定
        </Button>
        {savedNotice ? (
          <p className="text-caption text-success" role="status">
            决定已保存（显式保存，共 {(decisions ?? []).length} 条）。
          </p>
        ) : null}
        {(decisions ?? []).length > 0 ? (
          <details className="text-caption text-text-muted">
            <summary className="cursor-pointer">已保存的决定（{(decisions ?? []).length}）</summary>
            <ul className="mt-xs flex flex-col gap-xs">
              {(decisions ?? []).map((decision) => (
                <li key={decision.id} className="rounded-sm bg-surface-raised p-xs">
                  {decision.content}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
    </section>
  );
}

import { useWorkspaceStore } from "@/stores/workspaceStore";

function useWorkspaceProjectId(): string {
  return useWorkspaceStore((s) => s.activeProjectId);
}
