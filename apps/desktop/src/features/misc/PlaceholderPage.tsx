import { Alert } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import type { ViewId } from "@/stores/workspaceStore";
import { viewLabel } from "@/stores/workspaceStore";

/**
 * Deferred views stay honest: the placeholder explains what will arrive,
 * and never pretends to be a working feature. Only "reports" still reaches
 * this component — "settings" has a real page in the view registry.
 */
export function PlaceholderPage({ view }: { view: Extract<ViewId, "reports"> }) {
  return (
    <PageShell title={viewLabel(view)} description="该视图在 V0.1 尚未实现。">
      <Alert title="研究报告即将提供">
        研究综合简报与 Vault 导出会在研究流程集成后提供。
      </Alert>
    </PageShell>
  );
}
