import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { SourceCard } from "@/components/cards";
import { useSources } from "@/services/queries";

/** Sources view — every claim stays traceable to its origin. */
export function SourcesPage({ projectId }: { projectId: string }) {
  const { data: sources, isLoading, error, refetch } = useSources(projectId);

  return (
    <PageShell
      title="来源"
      description="检索与评估过的独立来源；质量评分描述权威性与主题适配度，不代表内容真伪。"
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(sources ?? []).length === 0}
        empty={{
          title: "还没有来源",
          description: "批准研究计划并开始运行后，检索到的来源会出现在这里。",
        }}
      >
        <ul className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          {(sources ?? []).map((source) => (
            <li key={source.id}>
              <SourceCard source={source} />
            </li>
          ))}
        </ul>
      </PageStates>
    </PageShell>
  );
}
