import { useEffect, useRef } from "react";
import { Menu, Sparkles } from "lucide-react";
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
 * breakpoint the popup becomes a full-width bottom sheet over a scrim
 * (so it never covers narrow-window form controls from the side) and the
 * docked sidebar is hidden while navigation moves into a drawer opened
 * from the 菜单 button.
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
            <Menu size={16} strokeWidth={1.75} aria-hidden="true" />
            菜单
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
      {/* Prototype fidelity (spec §8): the launcher stays mounted beneath
          the popup while the panel is open; the panel renders above it and
          focus management is unchanged. .brand-gradient-button carries the
          brass face and shadow; shape/padding come from className. Below lg
          the open sheet (z-40) covers the launcher entirely, so the compact
          button never floats over its own panel. */}
      <Button
        ref={launcherRef}
        variant="primary"
        aria-label="打开 AI 助手"
        onClick={() => setAssistantOpen(true)}
        className="brand-gradient-button fixed bottom-xl right-xl z-30 h-auto gap-sm rounded-full! px-md! py-sm text-micro font-bold!"
        data-testid="assistant-launcher"
      >
        <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-overlay-strong">
          <Sparkles size={18} strokeWidth={1.75} />
        </span>
        AI 助手
      </Button>

      {assistantOpen ? (
        <>
          {/* Scrim close target below lg only (display:none from lg up, so
              the desktop popup stays exactly as before): tapping beside the
              bottom sheet closes it, mirroring the sidebar drawer. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭助手面板"
            data-testid="assistant-backdrop"
            onClick={() => setAssistantOpen(false)}
            className="fixed inset-0 z-20 h-auto w-auto rounded-none bg-scrim! hover:bg-scrim! lg:hidden"
          />
          {/* Desktop (lg+): prototype 360×530 popup anchored bottom-right.
              Below lg the same element becomes a full-width bottom sheet
              (max-lg utilities) so it slides up from the bottom edge instead
              of floating over narrow-window form controls; content taller
              than 70dvh scrolls inside AssistantPanel. Intentionally
              non-modal per the prototype: Escape closes and focus returns to
              the launcher; no focus trap by design. */}
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Morpho AI 助手"
            data-testid="assistant-panel"
            className="assistant-popup fixed bottom-dock-offset right-xl z-30 flex h-dock-h w-[min(var(--morpho-layout-dock-width),calc(100vw-32px))] flex-col overflow-hidden rounded-dock border border-[rgb(217_160_91/0.3)] bg-surface shadow-[var(--morpho-shadow-overlay)] outline-none max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:w-auto max-lg:max-h-[70dvh] max-lg:rounded-b-none"
          >
            <AssistantPanel />
          </div>
        </>
      ) : null}
    </>
  );
}
