import { create } from "zustand";

/**
 * Workspace UI state (docs/architecture/MODULE_BOUNDARIES.md: Zustand for
 * local UI state). Navigation is a typed view registry instead of a router
 * — no router library is in the approved stack, and the PRD navigation is
 * a fixed set of project views.
 *
 * Note: switching the active project changes every query key (see
 * services/queries.ts) and the assistant context, so project data and
 * assistant state never cross projects.
 */

export const WORKSPACE_VIEWS = [
  { id: "projects", label: "项目" },
  { id: "config", label: "研究配置" },
  { id: "plan", label: "研究计划" },
  { id: "tasks", label: "任务" },
  { id: "sources", label: "来源" },
  { id: "knowledge", label: "知识库" },
  { id: "graph", label: "图谱" },
  { id: "timeline", label: "时间线" },
  { id: "gaps", label: "覆盖与缺口" },
  { id: "reports", label: "报告" },
  { id: "settings", label: "设置" },
] as const;

export type ViewId = (typeof WORKSPACE_VIEWS)[number]["id"];

export function viewLabel(view: ViewId): string {
  return WORKSPACE_VIEWS.find((v) => v.id === view)?.label ?? view;
}

interface WorkspaceState {
  activeProjectId: string;
  activeView: ViewId;
  assistantOpen: boolean;
  inspectorOpen: boolean;
  sidebarDrawerOpen: boolean;
  setActiveProject: (projectId: string) => void;
  setActiveView: (view: ViewId) => void;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setInspectorOpen: (open: boolean) => void;
  setSidebarDrawerOpen: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: "",
  activeView: "projects",
  assistantOpen: false,
  inspectorOpen: true,
  sidebarDrawerOpen: false,
  setActiveProject: (projectId) =>
    set({ activeProjectId: projectId, sidebarDrawerOpen: false }),
  setActiveView: (view) => set({ activeView: view, sidebarDrawerOpen: false }),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
  toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setSidebarDrawerOpen: (open) => set({ sidebarDrawerOpen: open }),
}));
