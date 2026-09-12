import { WORKSPACE_VIEWS, useWorkspaceStore } from "@/stores/workspaceStore";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import { viewContent } from "../viewRegistry";
import { Button } from "@morpho/ui";

/**
 * Workspace pattern (docs/frontend/PAGE_PATTERNS.md): 240px sidebar,
 * flexible canvas, 320px inspector. The inspector (contextual assistant)
 * collapses below 1024px; the sidebar becomes a drawer below 768px.
 */
export function WorkspaceLayout() {
  const activeView = useWorkspaceStore((s) => s.activeView);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const assistantOpen = useWorkspaceStore((s) => s.assistantOpen);
  const setAssistantOpen = useWorkspaceStore((s) => s.setAssistantOpen);
  const setDrawerOpen = useWorkspaceStore((s) => s.setSidebarDrawerOpen);

  const viewLabel =
    WORKSPACE_VIEWS.find((v) => v.id === activeView)?.label ?? "";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-md focus:py-sm"
      >
        跳到主内容
      </a>

      <Sidebar variant="docked" />

      <main
        id="main-content"
        className="main-glow flex min-w-0 flex-1 flex-col"
        aria-label={`${viewLabel}视图`}
      >
        <div className="flex items-center gap-sm border-b border-border px-md py-sm lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            aria-label="打开导航菜单"
            onClick={() => setDrawerOpen(true)}
          >
            ☰ 菜单
          </Button>
          <span className="text-label text-text-secondary">{viewLabel}</span>
        </div>

        <Topbar />
        <div className="view-fade min-h-0 flex-1">
          {viewContent(activeView, activeProjectId)}
        </div>
      </main>

      {activeProjectId !== "" ? (
        <>
          {/* Docked inspector from 1024px up. */}
          <aside
            aria-label="AI 助手"
            className="hidden w-80 shrink-0 border-l border-border bg-surface xl:block"
            data-testid="inspector-docked"
          >
            <AssistantPanel />
          </aside>

          {/* Overlay assistant below 1024px. */}
          <div className="xl:hidden">
            {assistantOpen ? (
              <div
                className="fixed inset-0 z-40 flex justify-end bg-black/40"
                data-testid="inspector-overlay"
              >
                <button
                  type="button"
                  aria-label="关闭 AI 助手"
                  className="absolute inset-0"
                  onClick={() => setAssistantOpen(false)}
                />
                <div className="relative h-full w-80 border-l border-border bg-surface shadow-[var(--morpho-shadow-overlay)]">
                  <AssistantPanel />
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="fixed bottom-lg right-lg z-30 rounded-full shadow-[var(--morpho-shadow-panel)]"
                onClick={() => setAssistantOpen(true)}
              >
                AI 助手
              </Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
