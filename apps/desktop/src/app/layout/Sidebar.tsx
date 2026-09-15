import { Button } from "@morpho/ui";
import {
  BookOpen,
  FileText,
  Globe,
  House,
  LayoutGrid,
  ListChecks,
  ListTree,
  Plus,
  ScrollText,
  SlidersHorizontal,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  WORKSPACE_VIEWS,
  useWorkspaceStore,
  type ViewIconName,
  type ViewId,
} from "@/stores/workspaceStore";
import { ProjectSwitcher } from "./ProjectSwitcher";

/**
 * Iconography (docs/frontend/COMPONENT_REGISTRY.md): single icon library
 * (lucide-react), 24-grid, stroke 1.75, 16px inline/nav size, single color
 * via currentColor. Maps the store's icon names to components so the store
 * itself stays data-only.
 */
const VIEW_ICONS: Record<ViewIconName, LucideIcon> = {
  "layout-grid": LayoutGrid,
  house: House,
  plus: Plus,
  "list-tree": ListTree,
  "list-checks": ListChecks,
  globe: Globe,
  "book-open": BookOpen,
  waypoints: Waypoints,
  "scroll-text": ScrollText,
  "sliders-horizontal": SlidersHorizontal,
  "file-text": FileText,
};

/** Nav-size view icon: 16px, 1.75 stroke, inherits text color. */
function ViewIcon({ name }: { name: ViewIconName }) {
  const Icon = VIEW_ICONS[name];
  return <Icon size={16} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * 236px navigation sidebar. Below the lg breakpoint it becomes an accessible
 * drawer (docs/frontend/PAGE_PATTERNS.md): aria-modal dialog semantics,
 * focus moves into the drawer when it opens, Tab is trapped, Escape closes
 * it, and focus returns to the opener (the 菜单 button) on close — the
 * same contract as the Dialog primitive.
 */
export function Sidebar({
  variant,
  returnFocusTo,
}: {
  variant: "docked" | "drawer";
  /** Drawer close returns focus here (the 菜单 button in WorkspaceLayout). */
  returnFocusTo?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("shell");
  const activeView = useWorkspaceStore((s) => s.activeView);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const drawerOpen = useWorkspaceStore((s) => s.sidebarDrawerOpen);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);

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
      aria-label={t("primaryNav")}
      className="flex h-full w-sidebar flex-col overflow-y-auto border-r border-border bg-surface-sunken p-md"
    >
      <div className="flex items-center gap-sm px-sm pb-lg pt-sm">
        <img
          src="/brand-mark.png"
          alt=""
          className="size-[34px] rounded-brand border border-border object-cover"
        />
        <span>
          <span className="kicker block">Research OS</span>
          <span className="block text-subhead font-bold leading-tight tracking-tight text-text-primary">
            Morpho
          </span>
        </span>
      </div>

      <ProjectSwitcher />

      <ul className="mt-lg flex flex-col gap-[3px]" data-testid="view-nav">
        {navViews.map((view) => (
          <li key={view.id}>
            <Button
              variant="ghost"
              aria-current={activeView === view.id ? "page" : undefined}
              onClick={() => setActiveView(view.id as ViewId)}
              className={`h-auto w-full justify-start gap-[11px]! border-0 px-md! py-sm text-left text-caption ${
                activeView === view.id
                  ? "bg-accent-soft! text-text-primary! shadow-[inset_2px_0_0_var(--morpho-color-accent)]"
                  : ""
              }`}
            >
              <span aria-hidden="true" className="flex w-4 shrink-0 justify-center">
                <ViewIcon name={view.icon} />
              </span>
              {/* view.label is the i18n key (e.g. "shell:nav.projects"); the
                  store stays data-only, the Sidebar translates at render. */}
              {t(view.label)}
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-auto grid gap-md border-t border-border pt-md">
        <div className="flex items-center gap-sm px-sm">
          <span aria-hidden="true" className="inline-block size-dot rounded-full bg-success" />
          <span>
            <strong className="block text-micro text-text-primary">{t("localWorkspace")}</strong>
            <small className="text-caption text-text-muted">{t("dataStaysLocal")}</small>
          </span>
        </div>
        {settingsView ? (
          <Button
            variant="ghost"
            aria-current={activeView === settingsView.id ? "page" : undefined}
            onClick={() => setActiveView(settingsView.id as ViewId)}
            className={`h-auto w-full justify-start gap-[11px]! border-0 px-md! py-sm text-left text-caption ${
              activeView === settingsView.id ? "bg-accent-soft! text-text-primary!" : ""
            }`}
          >
            <span aria-hidden="true" className="flex w-4 shrink-0 justify-center">
              <ViewIcon name={settingsView.icon} />
            </span>
            {t(settingsView.label)}
          </Button>
        ) : null}
      </div>
    </nav>
  );

  if (variant === "docked") {
    return <aside className="hidden lg:block lg:w-sidebar lg:shrink-0">{nav}</aside>;
  }

  if (!drawerOpen) return null;

  return (
    <SidebarDrawer returnFocusTo={returnFocusTo}>{nav}</SidebarDrawer>
  );
}

/** Focusable selector, mirroring the Dialog primitive (packages/ui). */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Drawer shell: mounted only while open so the focus contract maps onto
 * mount/unmount exactly like Dialog — focus in on mount, Escape + backdrop
 * close, Tab trapped inside the nav panel, focus back to the opener on
 * unmount.
 */
function SidebarDrawer({
  children,
  returnFocusTo,
}: {
  children: ReactNode;
  returnFocusTo?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("shell");
  const setDrawerOpen = useWorkspaceStore((s) => s.setSidebarDrawerOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables?.[0] ?? panel)?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown, true);
    return () => {
      document.removeEventListener("keydown", handleKeydown, true);
      returnFocusTo?.current?.focus();
    };
  }, [setDrawerOpen, returnFocusTo]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden" data-testid="sidebar-drawer">
      {/* Scrim close target on the Button primitive: size/face classes are
          neutralised so it keeps the plain full-bleed scrim of the drawer. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("closeNavigation")}
        className="absolute inset-0 h-auto w-auto rounded-none bg-scrim! hover:bg-scrim!"
        onClick={() => setDrawerOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("navigationMenu")}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 outline-none shadow-overlay"
      >
        {children}
      </div>
    </div>
  );
}
