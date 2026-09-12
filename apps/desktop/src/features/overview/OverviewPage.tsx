import { PageShell } from "@/components/PageShell";

/** 概览骨架 — 完整实现见 Task 7(spec §5)。 */
export function OverviewPage() {
  return (
    <PageShell title="概览" description="研究项目仪表盘。">
      <div data-testid="view-stub-overview" />
    </PageShell>
  );
}
