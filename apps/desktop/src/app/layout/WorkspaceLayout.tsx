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
 * bottom-right launcher that opens a 360×530 popup; below the lg
 * breakpoint the docked sidebar is hidden and navigation moves into a
 * drawer opened from the ☰ 菜单 button.
 */
export function WorkspaceLayout() {
  const activeView = useWorkspaceStore((s) => s.activeView);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setDrawerOpen = useWorkspaceStore((s) => s.setSidebarDrawerOpen);
  const drawerOpen = useWorkspaceStore((s) => s.sidebarDrawerOpen);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
            ref={menuButtonRef}
            variant="ghost"
            size="sm"
            aria-label="打开导航菜单"
            aria-expanded={drawerOpen}
            aria-controls="sidebar-drawer"
            onClick={() => setDrawerOpen(!drawerOpen)}
            data-testid="mobile-menu-button"
          >
            ☰ 菜单
          </Button>
          <span className="text-label text-text-secondary">{viewLabel}</span>
        </div>

        <Topbar />
        {/* Remount view content on project switch: per-view local state
            (unsaved drafts, selected ids) must never cross projects. */}
        <div key={activeProjectId} className="view-fade min-h-0 flex-1">
          {viewContent(activeView, activeProjectId)}
        </div>
      </main>

      <Sidebar variant="drawer" returnFocusTo={menuButtonRef} />

      {activeProjectId !== "" ? <AssistantDock /> : null}
    </div>
  );
}

/** 浮动助手(spec §8):右下 launcher + 360×530 弹出面板;Escape 关闭并归还焦点。 */
function AssistantDock() {
  const assistantOpen = useWorkspaceStore((s) => s.assistantOpen);
  const setAssistantOpen = useWorkspaceStore((s) => s.setAssistantOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!assistantOpen) {
      // Close transition (spec §8): return focus to the launcher so it
      // never drops to <body>. Skip the initial mount.
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        launcherRef.current?.focus();
      }
      return;
    }
    wasOpenRef.current = true;
    panelRef.current?.focus();
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setAssistantOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [assistantOpen, setAssistantOpen]);

  return (
    <>
      {/* Prototype fidelity (spec §8): the gradient launcher stays mounted
          beneath the popup while the panel is open; the panel renders above
          it and focus management is unchanged. */}
      <button
        type="button"
        ref={launcherRef}
        aria-label="打开 AI 助手"
        onClick={() => setAssistantOpen(true)}
        className="brand-gradient-button fixed bottom-xl right-xl z-30 flex items-center gap-sm rounded-full px-md py-sm text-micro font-bold text-text-on-brand transition-transform hover:-translate-y-0.5"
        data-testid="assistant-launcher"
      >
        <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-overlay-strong">
          ✦
        </span>
        AI 助手
      </button>

      {assistantOpen ? (
        // Intentionally non-modal per the prototype: Escape closes and focus
        // returns to the launcher; no focus trap by design.
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Morpho AI 助手"
          data-testid="assistant-panel"
          className="assistant-popup fixed bottom-dock-offset right-xl z-30 flex h-dock flex-col overflow-hidden rounded-dock border border-[rgb(114_167_255/0.3)] bg-surface shadow-[var(--morpho-shadow-overlay)] outline-none"
          style={{ width: "min(var(--morpho-layout-dock-width), calc(100vw - 32px))" }}
        >
          <AssistantPanel />
        </div>
      ) : null}
    </>
  );
}
