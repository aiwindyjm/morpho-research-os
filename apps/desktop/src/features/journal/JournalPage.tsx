import { useState } from "react";
import { Check } from "lucide-react";
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
 * 不进入研究 Vault,不发网络请求。
 */
export function JournalPage() {
  const date = todayIso();
  const [entries, setEntries] = useState<JournalEntry[]>(() => listEntries(date));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!draft.trim()) {
      setError("请先写下要记录的内容。");
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
      kicker="私有工作日志"
      title="对话日志"
      description="今天的架构和产品讨论只保存在本机，不会进入 Git 或研究 Vault。"
      actions={
        <>
          <Button variant="secondary" onClick={() => downloadJson(date)}>
            下载 JSON
          </Button>
          <Button variant="primary" onClick={() => downloadMarkdown(date)}>
            下载今日 Markdown
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.75fr)]">
        <Card className="flex flex-col p-lg" data-testid="journal-panel">
          <div className="flex items-center gap-md border-b border-border pb-md text-caption text-text-muted">
            <span className="pill pill-accent">{date}</span>
            <span data-testid="journal-count">{entries.length} 条记录</span>
            <span className="ml-auto flex items-center gap-sm text-success">
              <span aria-hidden="true" className="inline-block size-dot rounded-full bg-success" />
              仅本机
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
                    {entry.author === "user" ? "用户" : "Morpho"}
                  </strong>
                  <p className="mt-xs text-caption text-text-secondary">{entry.content}</p>
                </div>
              </li>
            ))}
            {entries.length === 0 ? (
              <li className="py-lg text-caption text-text-muted">
                还没有记录。写下今天的产品决定、问题或下一步。
              </li>
            ) : null}
          </ul>

          <div className="border-t border-border pt-md">
            <Textarea
              aria-label="日志内容"
              placeholder="记录今天的产品决定、问题或下一步…"
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
              <span className="text-caption text-text-muted">保存到浏览器本地存储</span>
              <Button variant="primary" size="sm" onClick={submit}>
                保存记录
              </Button>
            </div>
          </div>
        </Card>

        <Card className="h-fit p-lg">
          <p className="kicker mb-xs">保存规则</p>
          <h2 className="text-h3 text-text-primary">只属于你的开发记录</h2>
          <ul className="mt-md grid gap-sm text-caption text-text-secondary">
            {["按本地日期分组", "不上传、不进入 Git", "需要时显式下载 Markdown", "可以手动放入 private/conversations/"].map(
              (rule) => (
                <li key={rule} className="flex gap-sm">
                  <span aria-hidden="true" className="mt-[2px] shrink-0 text-success">
                    <Check size={16} strokeWidth={1.75} />
                  </span>
                  {rule}
                </li>
              ),
            )}
          </ul>
          <div className="mt-lg rounded-md border border-[rgb(217_160_91/0.2)] bg-accent-soft p-md">
            <strong className="text-nano text-text-primary">当前版本限制</strong>
            <p className="mt-xs text-nano leading-relaxed text-text-muted">
              Web 预览无法直接写入工作区。正式桌面版会由 Rust Core 按日追加本地文件。
            </p>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
