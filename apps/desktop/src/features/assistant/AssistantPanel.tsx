import { useEffect, useState } from "react";
import { Alert, Button, Textarea, useToast } from "@morpho/ui";
import { ASSISTANT_ACTION_LABELS } from "@/types/labels";
import type { AssistantAction, AssistantResponse } from "@/types/domain";
import type { JournalAuthor } from "@/types/journal";
import {
  useAssistantActions,
  useAssistantContext,
  useAssistantDecisions,
} from "@/services/queries";
import { addEntry, todayIso } from "@/services/journal";
import { isMorphoError } from "@/services/errors";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Contextual AI Assistant (docs/PRD.md §12, UI-05): anchored to the active
 * project, showing research context, with exactly four first-round actions.
 * Recording a decision requires an explicit save; nothing is persisted
 * automatically, and switching projects swaps the whole context.
 *
 * Saving the conversation to the journal (PRD §12, DO_NOT_BREAK #12) is an
 * explicit two-step action: 保存到日志 arms a confirmation, and only 确认保存
 * writes the transcript (user + assistant messages, save timestamp, project
 * id) into the local journal store used by the journal view. Nothing is ever
 * captured silently.
 *
 * Prototype alignment (spec §8): popup shell with a Morpho AI header, an
 * accent context strip, and a footer that jumps to the conversation journal.
 */

/** Prototype card style shared by the response and decision cards. */
const PANEL_CARD_CLASS = "rounded-md border border-border bg-overlay-soft p-sm";

/** One exchanged message of the current panel conversation. */
interface TranscriptMessage {
  author: JournalAuthor;
  content: string;
}

const CONTEXT_ACTIONS: Array<{
  action: "explain_progress" | "suggest_next_task" | "list_pending_reviews";
}> = [
  { action: "explain_progress" },
  { action: "suggest_next_task" },
  { action: "list_pending_reviews" },
];

export function AssistantPanel() {
  const projectId = useWorkspaceProjectId();
  const setAssistantOpen = useWorkspaceStore((s) => s.setAssistantOpen);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const { data: context, isLoading } = useAssistantContext(projectId);
  const { data: decisions } = useAssistantDecisions(projectId);
  const { act, saveDecision } = useAssistantActions(projectId);
  const { showToast } = useToast();

  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [decisionDraft, setDecisionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [journalSaveState, setJournalSaveState] = useState<
    "idle" | "confirming" | "saved"
  >("idle");

  // The dock stays mounted across project switches, so local state must be
  // cleared when the project changes: a response or draft from the old
  // project must never leak into the new one.
  useEffect(() => {
    setResponse(null);
    setDecisionDraft("");
    setError(null);
    setSavedNotice(false);
    setTranscript([]);
    setJournalSaveState("idle");
  }, [projectId]);

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
      // The exchange becomes part of the savable conversation transcript.
      setTranscript((prev) => [
        ...prev,
        { author: "user", content: ASSISTANT_ACTION_LABELS[action] },
        { author: "morpho", content: result.summary },
      ]);
      setJournalSaveState("idle");
    } catch (err) {
      setError(
        isMorphoError(err) ? err.userMessage : "助手暂时不可用，请重试。",
      );
    }
  }

  /** Explicit save (second click) — see DO_NOT_BREAK #12. */
  function confirmSaveToJournal() {
    if (transcript.length === 0) return;
    const projectName = context?.project_name ?? "未知项目";
    const content = [
      `从 AI 助手保存的对话（项目：${projectName} · ID ${projectId}）`,
      ...transcript.map(
        (message) => `[${message.author === "user" ? "用户" : "Morpho"}] ${message.content}`,
      ),
    ].join("\n");
    addEntry(todayIso(), "morpho", content);
    setJournalSaveState("saved");
    showToast({
      title: "已保存到对话日志",
      detail: `共 ${transcript.length} 条消息（仅本机）`,
      variant: "success",
    });
  }

  return (
    <section
      aria-label="AI 研究助手"
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="assistant-panel-body"
    >
      <header className="flex items-start justify-between border-b border-border p-md">
        <div>
          <p className="kicker mb-xs">当前项目助手</p>
          <h2 className="text-h3 text-text-primary">Morpho AI</h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label="关闭 AI 助手"
          onClick={() => setAssistantOpen(false)}
        >
          ×
        </Button>
      </header>

      <div className="bg-accent-soft px-md py-sm text-nano text-text-muted">
        {isLoading ? (
          <p role="status">正在加载项目上下文…</p>
        ) : context ? (
          <p>
            正在使用 <strong>{context.project_name}</strong> 的研究上下文
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto p-md">
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
          <div className={PANEL_CARD_CLASS} data-testid="assistant-response">
            <p className="text-body text-text-primary">{response.summary}</p>
            {response.items.length > 0 ? (
              <ul className="mt-sm flex flex-col gap-xs">
                {response.items.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="text-caption text-text-secondary">
                    <span className="text-text-primary">{item.label}</span>
                    {item.detail ? ` — ${item.detail}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className={PANEL_CARD_CLASS} data-testid="assistant-journal-save">
          <p className="text-label text-text-primary">保存对话到日志</p>
          <p className="mt-xs text-caption text-text-muted">
            当前对话共 {transcript.length} 条消息；只有你点击「确认保存」才会写入
            本机对话日志，不会自动保存。
          </p>
          {journalSaveState === "confirming" ? (
            <div className="mt-sm flex flex-col gap-xs" role="group" aria-label="确认保存对话">
              <p className="text-caption text-text-secondary">
                将把 {transcript.length} 条消息保存到今天的对话日志（{todayIso()}，仅本机）。
              </p>
              <div className="flex items-center gap-sm">
                <Button size="sm" variant="primary" onClick={confirmSaveToJournal}>
                  确认保存
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setJournalSaveState("idle")}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="mt-sm"
              disabled={transcript.length === 0}
              onClick={() => setJournalSaveState("confirming")}
            >
              保存到日志
            </Button>
          )}
          {journalSaveState === "saved" ? (
            <p className="mt-xs text-caption text-success" role="status">
              已保存 {transcript.length} 条消息到今天的对话日志。{" "}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-xs py-0 align-baseline text-info! hover:underline"
                onClick={() => setActiveView("journal")}
              >
                查看对话日志 →
              </Button>
            </p>
          ) : null}
        </div>

        <div className={PANEL_CARD_CLASS}>
          <p className="text-label text-text-primary">记录决定</p>
          <p className="mt-xs text-caption text-text-muted">
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
            className="mt-sm"
            onClick={() => void runAction("record_decision")}
            loading={saveDecision.isPending}
          >
            保存决定
          </Button>
          {savedNotice ? (
            <p className="mt-xs text-caption text-success" role="status">
              决定已保存（显式保存，共 {(decisions ?? []).length} 条）。
            </p>
          ) : null}
          {(decisions ?? []).length > 0 ? (
            <details className="mt-xs text-caption text-text-muted">
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
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-md pb-sm pt-xs text-[9px] text-text-muted">
        <span>AI 会基于当前项目工作区回答</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-xs py-0 text-info! hover:underline"
          onClick={() => setActiveView("journal")}
        >
          记录对话
        </Button>
      </footer>
    </section>
  );
}

function useWorkspaceProjectId(): string {
  return useWorkspaceStore((s) => s.activeProjectId);
}
