import { Badge, Card } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { useTimeline } from "@/services/queries";

const KIND_LABELS: Record<string, { label: string; variant: "accent" | "info" | "success" | "neutral" | "warning" }> = {
  run: { label: "运行", variant: "accent" },
  task: { label: "任务", variant: "info" },
  source: { label: "来源", variant: "success" },
  claim: { label: "论断", variant: "warning" },
  knowledge: { label: "知识", variant: "neutral" },
};

/** Timeline view (RES-10): chronological projection of research activity. */
export function TimelinePage({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useTimeline(projectId);

  return (
    <PageShell
      title="时间线"
      description="按时间倒序展示运行、来源、论断与知识事件。"
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(data ?? []).length === 0}
        empty={{
          title: "时间线还没有事件",
          description: "开始一次研究运行后，事件会按时间出现在这里。",
        }}
      >
        <ol className="relative flex flex-col gap-md border-l border-border pl-lg" data-testid="timeline">
          {(data ?? []).map((entry) => {
            const kind = KIND_LABELS[entry.kind] ?? KIND_LABELS.run;
            return (
              <li key={entry.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[26px] top-md size-3 rounded-full border-2 border-background bg-accent"
                />
                <Card className="flex flex-col gap-xs">
                  <div className="flex flex-wrap items-center gap-sm">
                    <Badge variant={kind.variant}>{kind.label}</Badge>
                    <time className="text-caption text-text-muted" dateTime={entry.timestamp}>
                      {entry.timestamp.slice(0, 16).replace("T", " ")} UTC
                    </time>
                  </div>
                  <p className="text-body text-text-primary">{entry.title}</p>
                  <p className="text-caption text-text-secondary">{entry.detail}</p>
                </Card>
              </li>
            );
          })}
        </ol>
      </PageStates>
    </PageShell>
  );
}
