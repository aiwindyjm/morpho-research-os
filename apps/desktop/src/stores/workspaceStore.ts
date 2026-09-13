import { create } from "zustand";

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

export const WORKSPACE_VIEWS = [
  { id: "projects", label: "我的研究", icon: "▦" },
  { id: "overview", label: "概览", icon: "⌂" },
  { id: "config", label: "研究配置", icon: "＋" },
  { id: "plan", label: "研究计划", icon: "☷" },
  { id: "tasks", label: "任务", icon: "✓" },
  { id: "sources", label: "来源", icon: "◌" },
  { id: "knowledge", label: "知识", icon: "◇" },
  { id: "graph", label: "图谱", icon: "⌘" },
  { id: "journal", label: "对话日志", icon: "▤" },
  { id: "settings", label: "设置", icon: "⚙" },
  // PRD §13 保留注册,不进侧栏导航(ADR-013)。
  { id: "reports", label: "报告", icon: "◫" },
] as const;

export type ViewId = (typeof WORKSPACE_VIEWS)[number]["id"];

export function viewLabel(view: ViewId): string {
  return WORKSPACE_VIEWS.find((v) => v.id === view)?.label ?? view;
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
