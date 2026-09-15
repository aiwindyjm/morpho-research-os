import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Textarea } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import {
  addEntry,
  downloadJson,
  downloadMarkdown,
  listEntries,
  todayIso,
} from "@/services/journal";
import type { JournalEntry } from "@/types/journal";

/**
 * 对话日志(spec §7):本机私有工作日志。按日分组、显式下载;
 * 不进入研究 Vault,不发网络请求。All chrome strings go through t()
 * (ADR-023, "journal" namespace); the "Morpho" author stays a brand
 * constant.
 */
export function JournalPage() {
  const { t } = useTranslation("journal");
  const date = todayIso();
  const [entries, setEntries] = useState<JournalEntry[]>(() => listEntries(date));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!draft.trim()) {
      setError(t("errorEmpty"));
      return;
    }
    setError(null);
    setEntries(listEntries(date)); // 以存储为准,防止并发丢失
    const created = addEntry(date, "user", draft);
    setEntries((prev) => [...prev, created]);
    setDraft("");
  }

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={
        <>
          <Button variant="secondary" onClick={() => downloadJson(date)}>
            {t("downloadJson")}
          </Button>
          <Button variant="primary" onClick={() => downloadMarkdown(date)}>
            {t("downloadMarkdown")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.75fr)]">
        <Card className="flex flex-col p-lg" data-testid="journal-panel">
          <div className="flex items-center gap-md border-b border-border pb-md text-caption text-text-muted">
            <span className="pill pill-accent">{date}</span>
            <span data-testid="journal-count">{t("count", { total: entries.length })}</span>
            <span className="ml-auto flex items-center gap-sm text-success">
              <span aria-hidden="true" className="inline-block size-dot rounded-full bg-success" />
              {t("localOnly")}
            </span>
          </div>

          <ul className="min-h-[260px] py-md" data-testid="journal-list">
            {entries.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[48px_1fr] gap-md border-b border-border py-sm last:border-b-0">
                <span className="pt-xs font-mono text-nano text-text-muted">{entry.time}</span>
                <div>
                  <strong
                    className={`text-micro ${entry.author === "user" ? "text-info" : "text-accent-alt"}`}
                  >
                    {entry.author === "user" ? t("authorUser") : "Morpho"}
                  </strong>
                  <p className="mt-xs text-caption text-text-secondary">{entry.content}</p>
                </div>
              </li>
            ))}
            {entries.length === 0 ? (
              <li className="py-lg text-caption text-text-muted">
                {t("listEmpty")}
              </li>
            ) : null}
          </ul>

          <div className="border-t border-border pt-md">
            <Textarea
              aria-label={t("inputAria")}
              placeholder={t("inputPlaceholder")}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error ? (
              <p role="alert" className="mt-xs text-caption text-error">
                {error}
              </p>
            ) : null}
            <div className="mt-sm flex items-center justify-between">
              <span className="text-caption text-text-muted">{t("storageNote")}</span>
              <Button variant="primary" size="sm" onClick={submit}>
                {t("save")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="h-fit p-lg">
          <p className="kicker mb-xs">{t("rules.kicker")}</p>
          <h2 className="text-h3 text-text-primary">{t("rules.title")}</h2>
          <ul className="mt-md grid gap-sm text-caption text-text-secondary">
            {(
              [
                "rules.items.byLocalDate",
                "rules.items.neverUploaded",
                "rules.items.explicitDownload",
                "rules.items.privateFolder",
              ] as const
            ).map((key) => (
              <li key={key} className="flex gap-sm">
                <span aria-hidden="true" className="mt-[2px] shrink-0 text-success">
                  <Check size={16} strokeWidth={1.75} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-lg rounded-md border border-[rgb(217_160_91/0.2)] bg-accent-soft p-md">
            <strong className="text-nano text-text-primary">{t("limits.title")}</strong>
            <p className="mt-xs text-nano leading-relaxed text-text-muted">
              {t("limits.detail")}
            </p>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
