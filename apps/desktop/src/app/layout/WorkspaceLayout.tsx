import { useEffect, useRef } from "react";
import { WORKSPACE_VIEWS, useWorkspaceStore } from "@/stores/workspaceStore";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import { viewContent } from "../viewRegistry";
import { Button } from "@morpho/ui";

/**
 * Workspace pattern (docs/frontend/PAGE_PATTERNS.md): 240px sidebar,
 * flexible canvas, floating contextual assistant. The assistant is a
 * bottom-right launcher that opens a 360×530 popup; the sidebar becomes
 * a drawer below 768px.
 */
export function WorkspaceLayout() {
  const activeView = useWorkspaceStore((s) => s.activeView);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
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

      {activeProjectId !== "" ? <AssistantDock /> : null}
    </div>
  );
}

/** 浮动助手(spec §8):右下 launcher + 360×530 弹出面板;Escape 关闭。 */
function AssistantDock() {
  const assistantOpen = useWorkspaceStore((s) => s.assistantOpen);
  const setAssistantOpen = useWorkspaceStore((s) => s.setAssistantOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!assistantOpen) return;
    panelRef.current?.focus();
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setAssistantOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [assistantOpen, setAssistantOpen]);

  return (
    <>
      {!assistantOpen ? (
        <button
          type="button"
          aria-label="打开 AI 助手"
          onClick={() => setAssistantOpen(true)}
          className="brand-gradient-button fixed bottom-xl right-xl z-30 flex items-center gap-sm rounded-full px-md py-sm text-[11px] font-bold text-[#f2f6ff] transition-transform hover:-translate-y-0.5"
          data-testid="assistant-launcher"
        >
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-white/20">
            ✦
          </span>
          AI 助手
        </button>
      ) : (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Morpho AI 助手"
          data-testid="assistant-panel"
          className="assistant-popup fixed bottom-[76px] right-xl z-30 flex h-[530px] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] border border-[rgb(114_167_255/0.3)] bg-surface shadow-[var(--morpho-shadow-overlay)] outline-none"
        >
          <AssistantPanel />
        </div>
      )}
    </>
  );
}
