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
  // 项目作用域视图(config/plan/tasks 等)依赖活动项目,未选中项目时只保留「我的研究」;
  // 设置是全局入口,按原型放在侧栏底部而非主列表 —— 请勿把它"补"回上面的列表。
  const navViews = WORKSPACE_VIEWS.filter(
    (view) =>
      view.id !== "reports" && view.id !== "settings" && (hasProject || view.id === "projects"),
  );
  const settingsView = WORKSPACE_VIEWS.find((view) => view.id === "settings");

  const nav = (
    <nav
      aria-label="主导航"
      className="flex h-full w-[236px] flex-col overflow-y-auto border-r border-border bg-[#0d121b] p-md"
    >
      <div className="flex items-center gap-sm px-sm pb-lg pt-sm">
        <span
          aria-hidden="true"
          className="brand-mark flex size-[34px] items-center justify-center rounded-[10px] text-[17px] font-extrabold text-[#f2f6ff]"
        >
          M
        </span>
        <span>
          <span className="kicker block">Research OS</span>
          <span className="block text-[17px] font-bold leading-tight tracking-tight text-text-primary">
            Morpho
          </span>
        </span>
      </div>

      <ProjectSwitcher />

      <ul className="mt-lg flex flex-col gap-[3px]" data-testid="view-nav">
        {navViews.map((view) => (
          <li key={view.id}>
            <button
              type="button"
              aria-current={activeView === view.id ? "page" : undefined}
              onClick={() => setActiveView(view.id as ViewId)}
              className={`flex w-full items-center gap-[11px] rounded-md px-md py-sm text-left text-[12px] transition-colors duration-[var(--morpho-motion-fast)] ${
                activeView === view.id
                  ? "bg-accent-soft text-text-primary shadow-[inset_2px_0_0_var(--morpho-color-accent)]"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <span aria-hidden="true" className="w-4 text-center text-base leading-none">
                {view.icon}
              </span>
              {view.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-auto grid gap-md border-t border-border pt-md">
        <div className="flex items-center gap-sm px-sm">
          <span aria-hidden="true" className="inline-block size-[7px] rounded-full bg-success" />
          <span>
            <strong className="block text-[11px] text-text-primary">本地工作区</strong>
            <small className="text-caption text-text-muted">数据保存在本机</small>
          </span>
        </div>
        {settingsView ? (
          <button
            type="button"
            aria-current={activeView === settingsView.id ? "page" : undefined}
            onClick={() => setActiveView(settingsView.id as ViewId)}
            className={`flex w-full items-center gap-[11px] rounded-md px-md py-sm text-left text-[12px] ${
              activeView === settingsView.id
                ? "bg-accent-soft text-text-primary"
                : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            <span aria-hidden="true" className="w-4 text-center text-base leading-none">
              {settingsView.icon}
            </span>
            {settingsView.label}
          </button>
        ) : null}
      </div>
    </nav>
  );

  if (variant === "docked") {
    return <aside className="hidden md:block md:w-[236px] md:shrink-0">{nav}</aside>;
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
