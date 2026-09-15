import { create } from "zustand";
import { i18n } from "@/i18n";

/**
 * Workspace UI state (docs/architecture/MODULE_BOUNDARIES.md: Zustand for
 * local UI state). Navigation is a typed view registry instead of a router
 * — no router library is in the approved stack, and the PRD navigation is
 * a fixed set of project views.
 *
 * Note: switching the active project changes every query key (see
 * services/queries.ts) and remounts view content (see WorkspaceLayout,
 * which keys the view container by the project id), so project data and
 * per-view local state never cross projects.
 */

/**
 * Views carry icon *names*, not glyph characters: the store stays a
 * data-only module, and the Sidebar maps each name to its lucide-react
 * component at render time (docs/frontend/COMPONENT_REGISTRY.md
 * "Iconography"). View labels are i18n KEYS (ADR-023, "shell" namespace —
 * e.g. "shell:nav.plan"); Sidebar/WorkspaceLayout translate them at render
 * with t(), so ids/testids and the registry shape are unchanged.
 */
export const WORKSPACE_VIEWS = [
  { id: "projects", label: "shell:nav.projects", icon: "layout-grid" },
  { id: "overview", label: "shell:nav.overview", icon: "house" },
  { id: "config", label: "shell:nav.config", icon: "plus" },
  { id: "plan", label: "shell:nav.plan", icon: "list-tree" },
  { id: "tasks", label: "shell:nav.tasks", icon: "list-checks" },
  { id: "sources", label: "shell:nav.sources", icon: "globe" },
  { id: "knowledge", label: "shell:nav.knowledge", icon: "book-open" },
  { id: "graph", label: "shell:nav.graph", icon: "waypoints" },
  { id: "journal", label: "shell:nav.journal", icon: "scroll-text" },
  { id: "settings", label: "shell:nav.settings", icon: "sliders-horizontal" },
  // PRD §13 保留注册,不进侧栏导航(ADR-013)。
  { id: "reports", label: "shell:nav.reports", icon: "file-text" },
] as const;

export type ViewId = (typeof WORKSPACE_VIEWS)[number]["id"];

/** Icon names carried by WORKSPACE_VIEWS; rendered by the Sidebar via lucide. */
export type ViewIconName = (typeof WORKSPACE_VIEWS)[number]["icon"];

/** Display label for a view id, resolved through the i18n instance. */
export function viewLabel(view: ViewId): string {
  const entry = WORKSPACE_VIEWS.find((v) => v.id === view);
  return entry ? i18n.t(entry.label) : view;
}

interface WorkspaceState {
  activeProjectId: string;
  activeView: ViewId;
  assistantOpen: boolean;
  sidebarDrawerOpen: boolean;
  setActiveProject: (projectId: string) => void;
  setActiveView: (view: ViewId) => void;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setSidebarDrawerOpen: (open: boolean) => void;
  /**
   * Clears only the volatile overlay flags (assistantOpen, sidebarDrawerOpen)
   * when a session is invalidated proactively (services/sessionState.ts).
   * Deliberately does NOT touch activeProjectId/activeView — the caller that
   * reacts to the invalidation event decides the navigation.
   */
  resetVolatileState: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: "",
  activeView: "projects",
  assistantOpen: false,
  sidebarDrawerOpen: false,
  setActiveProject: (projectId) =>
    set({ activeProjectId: projectId, sidebarDrawerOpen: false }),
  setActiveView: (view) => set({ activeView: view, sidebarDrawerOpen: false }),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
  toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),
  setSidebarDrawerOpen: (open) => set({ sidebarDrawerOpen: open }),
  resetVolatileState: () =>
    set({ assistantOpen: false, sidebarDrawerOpen: false }),
}));
