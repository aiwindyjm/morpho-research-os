import { useEffect } from "react";
import { WORKSPACE_VIEWS, useWorkspaceStore, type ViewId } from "@/stores/workspaceStore";
import { ProjectSwitcher } from "./ProjectSwitcher";

/**
 * 240px navigation sidebar. Below 768px it becomes an accessible drawer
 * (docs/frontend/PAGE_PATTERNS.md); Escape closes it and focus moves to
 * the first item when it opens.
 */
export function Sidebar({ variant }: { variant: "docked" | "drawer" }) {
  const activeView = useWorkspaceStore((s) => s.activeView);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const drawerOpen = useWorkspaceStore((s) => s.sidebarDrawerOpen);
  const setDrawerOpen = useWorkspaceStore((s) => s.setSidebarDrawerOpen);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);

  useEffect(() => {
    if (variant !== "drawer" || !drawerOpen) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [variant, drawerOpen, setDrawerOpen]);

  const hasProject = activeProjectId !== "";
  const items = WORKSPACE_VIEWS.filter(
    (view) =>
      view.id !== "reports" && view.id !== "settings" && (hasProject || view.id === "projects"),
  );

  const nav = (
    <nav
      aria-label="主导航"
      className="flex h-full w-60 flex-col gap-md overflow-y-auto border-r border-border bg-surface p-md"
    >
      <div className="flex items-center gap-sm px-sm py-sm">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-md bg-accent text-label text-background"
        >
          M
        </span>
        <span className="text-h3 text-text-primary">Morpho Research</span>
      </div>

      <ProjectSwitcher />

      <ul className="flex flex-col gap-xs" data-testid="view-nav">
        {items.map((view) => (
          <li key={view.id}>
            <button
              type="button"
              aria-current={activeView === view.id ? "page" : undefined}
              onClick={() => setActiveView(view.id as ViewId)}
              className={`w-full rounded-md px-md py-sm text-left text-label transition-colors duration-[var(--morpho-motion-fast)] ${
                activeView === view.id
                  ? "bg-accent-soft text-text-primary"
                  : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
              }`}
            >
              {view.label}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-auto px-sm text-caption text-text-muted">
        本地优先 · 研究是你的资产
      </p>
    </nav>
  );

  if (variant === "docked") {
    return <aside className="hidden md:block md:w-60 md:shrink-0">{nav}</aside>;
  }

  if (!drawerOpen) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden" data-testid="sidebar-drawer">
      <button
        type="button"
        aria-label="关闭导航"
        className="absolute inset-0 bg-black/60"
        onClick={() => setDrawerOpen(false)}
      />
      <div className="absolute inset-y-0 left-0 shadow-[var(--morpho-shadow-overlay)]">
        {nav}
      </div>
    </div>
  );
}
