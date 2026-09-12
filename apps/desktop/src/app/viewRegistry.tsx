import type { ViewId } from "@/stores/workspaceStore";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { ConfigPage } from "@/features/config/ConfigPage";
import { PlanPage } from "@/features/plan/PlanPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { GraphPage } from "@/features/graph/GraphPage";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { JournalPage } from "@/features/journal/JournalPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { PlaceholderPage } from "@/features/misc/PlaceholderPage";

/**
 * Typed view registry (PRD §13 views). Navigation swaps this registry —
 * no router dependency is introduced in V0.1.
 */
export function viewContent(view: ViewId, projectId: string) {
  switch (view) {
    case "projects":
      return <ProjectsPage />;
    case "overview":
      return <OverviewPage />;
    case "config":
      return <ConfigPage projectId={projectId} />;
    case "plan":
      return <PlanPage projectId={projectId} />;
    case "tasks":
      return <TasksPage projectId={projectId} />;
    case "sources":
      return <SourcesPage projectId={projectId} />;
    case "knowledge":
      return <KnowledgePage projectId={projectId} />;
    case "graph":
      return <GraphPage projectId={projectId} />;
    case "journal":
      return <JournalPage />;
    case "settings":
      return <SettingsPage />;
    case "reports":
      return <PlaceholderPage view={view} />;
    default: {
      const exhaustive: never = view;
      throw new Error(`unknown view: ${String(exhaustive)}`);
    }
  }
}
