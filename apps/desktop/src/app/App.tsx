import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "./queryClient";
import { WorkspaceLayout } from "./layout/WorkspaceLayout";
import { AppBridges } from "./bridges";
import { useProjects } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Application shell: providers, workspace layout, and first-project
 * selection. No business flow lives here (UI-01 boundary).
 */
export function App({ client }: { client?: ReturnType<typeof createQueryClient> }) {
  const [ownedClient] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={client ?? ownedClient}>
      <ToastProvider>
        {/* Event-stream → cache invalidation and project-switch purges
            (app/bridges.tsx); mounted above the layout so they survive
            every view remount. */}
        <AppBridges />
        <ProjectBootstrap />
        <WorkspaceLayout />
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Select the first project on first load so views have context. */
function ProjectBootstrap() {
  const { data: projects } = useProjects();
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);

  useEffect(() => {
    if (!activeProjectId && projects && projects.length > 0) {
      setActiveProject(projects[0].id);
    }
  }, [activeProjectId, projects, setActiveProject]);

  return null;
}
