import { PageShell } from "@/components/PageShell";

/** 对话日志骨架 — 完整实现见 Task 6(spec §7)。 */
export function JournalPage() {
  return (
    <PageShell title="对话日志" description="只属于你的私有工作日志。">
      <div data-testid="view-stub-journal" />
    </PageShell>
  );
}
