import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Textarea, useToast } from "@morpho/ui";
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
 * All chrome strings go through t() (ADR-023, "assistant" namespace); the
 * four action labels resolve through common:vocab.assistantAction.
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
  const { t } = useTranslation("assistant");
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
          setError(t("decision.empty"));
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
        {
          author: "user",
          content: t(`common:vocab.assistantAction.${action}`, { defaultValue: action }),
        },
        { author: "morpho", content: result.summary },
      ]);
      setJournalSaveState("idle");
    } catch (err) {
      setError(
        isMorphoError(err) ? err.userMessage : t("error.fallback"),
      );
    }
  }

  /** Explicit save (second click) — see DO_NOT_BREAK #12. */
  function confirmSaveToJournal() {
    if (transcript.length === 0) return;
    const projectName = context?.project_name ?? t("entry.unknownProject");
    const content = [
      t("entry.header", { project: projectName, id: projectId }),
      ...transcript.map((message) =>
        t("entry.line", {
          author: message.author === "user" ? t("entry.authorLabel") : "Morpho",
          content: message.content,
        }),
      ),
    ].join("\n");
    addEntry(todayIso(), "morpho", content);
    setJournalSaveState("saved");
    showToast({
      title: t("toast.savedTitle"),
      detail: t("toast.savedDetail", { total: transcript.length }),
      variant: "success",
    });
  }

  return (
    <section
      aria-label={t("aria")}
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="assistant-panel-body"
    >
      <header className="flex items-start justify-between border-b border-border p-md">
        <div>
          <p className="kicker mb-xs">{t("kicker")}</p>
          <h2 className="text-h3 text-text-primary">Morpho AI</h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("closeAria")}
          onClick={() => setAssistantOpen(false)}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </header>

      <div className="bg-accent-soft px-md py-sm text-nano text-text-muted">
        {isLoading ? (
          <p role="status">{t("context.loading")}</p>
        ) : context ? (
          <p>
            {t("context.usingBefore")}
            <strong>{context.project_name}</strong>
            {t("context.usingAfter")}
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto p-md">
        <nav aria-label={t("navAria")} className="flex flex-col gap-xs">
          {CONTEXT_ACTIONS.map(({ action }) => (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              onClick={() => void runAction(action)}
              loading={act.isPending && act.variables === action}
            >
              {t(`common:vocab.assistantAction.${action}`, { defaultValue: action })}
            </Button>
          ))}
        </nav>

        {error ? (
          <Alert variant="error" title={t("error.title")}>
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
          <p className="text-label text-text-primary">{t("journalSave.title")}</p>
          <p className="mt-xs text-caption text-text-muted">
            {t("journalSave.idle", { total: transcript.length })}
          </p>
          {journalSaveState === "confirming" ? (
            <div className="mt-sm flex flex-col gap-xs" role="group" aria-label={t("journalSave.groupAria")}>
              <p className="text-caption text-text-secondary">
                {t("journalSave.confirmDetail", { total: transcript.length, date: todayIso() })}
              </p>
              <div className="flex items-center gap-sm">
                <Button size="sm" variant="primary" onClick={confirmSaveToJournal}>
                  {t("journalSave.confirm")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setJournalSaveState("idle")}
                >
                  {t("journalSave.cancel")}
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
              {t("journalSave.arm")}
            </Button>
          )}
          {journalSaveState === "saved" ? (
            <p className="mt-xs text-caption text-success" role="status">
              {t("journalSave.saved", { total: transcript.length })}{" "}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-xs py-0 align-baseline text-info! hover:underline"
                onClick={() => setActiveView("journal")}
              >
                {t("journalSave.viewJournal")}
              </Button>
            </p>
          ) : null}
        </div>

        <div className={PANEL_CARD_CLASS}>
          <p className="text-label text-text-primary">{t("decision.title")}</p>
          <p className="mt-xs text-caption text-text-muted">
            {t("decision.hint")}
          </p>
          <Textarea
            aria-label={t("decision.inputAria")}
            placeholder={t("decision.inputPlaceholder")}
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
            {t("decision.save")}
          </Button>
          {savedNotice ? (
            <p className="mt-xs text-caption text-success" role="status">
              {t("decision.saved", { total: (decisions ?? []).length })}
            </p>
          ) : null}
          {(decisions ?? []).length > 0 ? (
            <details className="mt-xs text-caption text-text-muted">
              <summary className="cursor-pointer">
                {t("decision.listSummary", { total: (decisions ?? []).length })}
              </summary>
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
        <span>{t("footer.note")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-xs py-0 text-info! hover:underline"
          onClick={() => setActiveView("journal")}
        >
          {t("footer.openJournal")}
        </Button>
      </footer>
    </section>
  );
}

function useWorkspaceProjectId(): string {
  return useWorkspaceStore((s) => s.activeProjectId);
}
