import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listenResearchEvents } from "@/services/tauriTransport";
import { queryKeys } from "@/services/queries";
import { purgeVolatileSessionState } from "@/services/sessionState";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * App-level wiring that turns transport-level signals into UI state moves.
 * Mounted once from App (inside QueryClientProvider); renders nothing.
 *
 *  1. ResearchEventBridge — the `morpho://events` stream (Rust worker pump,
 *     state.rs) maps each incoming event kind onto TanStack Query
 *     invalidations so views refresh the moment the core reports progress,
 *     instead of waiting for the 900–1500 ms fallback polling in
 *     services/queries.ts. Polling is deliberately KEPT: it self-disables
 *     when a run is idle, covers the mock/web-preview mode where the event
 *     stream is a no-op, and heals any event dropped between listener
 *     (re)mounts. Events win on freshness, polling on coverage.
 *
 *  2. SessionInvalidationBridge — proactive session invalidation
 *     (sessionState.ts): every active-project switch purges all
 *     project-scoped query caches and volatile overlay flags synchronously
 *     inside the store update, before the next project's views mount. The
 *     frozen research-event vocabulary (packages/schemas/event.v1.json)
 *     currently defines NO project-lock / permission-revocation /
 *     version-invalidation kinds, so no event listener for them exists
 *     today (inventing event names is forbidden); when such a kind is
 *     ratified, its listener must call purgeVolatileSessionState() and
 *     navigate per the sessionState.ts integration notes.
 */

/** Query-cache regions an event kind can dirty. */
export type QueryKeyKind =
  | "plan"
  | "run"
  | "tasks"
  | "sources"
  | "knowledge"
  | "claims"
  | "graph"
  | "coverage"
  | "gaps"
  | "timeline"
  | "assistantContext"
  /** Global project list (updated_at/progress pills). */
  | "projects"
;

/** Per-prefix baseline: what the event group touches. */
const KINDS_BY_PREFIX: Record<string, readonly QueryKeyKind[]> = {
  task: ["run", "tasks", "timeline", "assistantContext"],
  run: ["run", "tasks", "timeline", "assistantContext"],
  plan: ["plan", "tasks", "timeline", "assistantContext"],
  source: ["sources", "coverage", "gaps", "timeline"],
  claim: ["claims", "knowledge", "coverage", "gaps", "timeline"],
  knowledge: ["knowledge", "graph", "coverage", "gaps", "timeline"],
  review: ["assistantContext", "tasks", "timeline"],
};

/** Extra regions that only matter when content actually lands or settles. */
const SETTLED_EXTRA: readonly QueryKeyKind[] = [
  "sources",
  "knowledge",
  "claims",
  "graph",
  "coverage",
  "gaps",
  "projects",
];

/** Events whose transitions mean "new content is now persisted". */
const SETTLED_EVENTS = new Set([
  "task.completed",
  "run.completed",
  "run.incremental_report",
]);

/**
 * Event kind (worker `event_type`, aligned with the event.v1.json closed
 * vocabulary) → query-cache regions to invalidate. Pure and exported for
 * tests; unknown prefixes invalidate nothing (a wrong guess must not cause
 * a refetch storm).
 */
export function invalidationKindsForEventType(eventType: string): readonly QueryKeyKind[] {
  const prefix = eventType.split(".")[0] ?? "";
  const baseline = KINDS_BY_PREFIX[prefix];
  if (!baseline) return [];
  const settled = SETTLED_EVENTS.has(eventType)
    ? baseline.concat(SETTLED_EXTRA.filter((kind) => !baseline.includes(kind)))
    : baseline;
  // A terminal run state also refreshes the global project list.
  if (eventType === "run.completed" || eventType === "run.failed" || eventType === "run.cancelled") {
    return settled.includes("projects") ? settled : [...settled, "projects"];
  }
  return settled;
}

function queryKeyForKind(kind: QueryKeyKind, projectId: string): readonly unknown[] {
  switch (kind) {
    case "plan":
      return queryKeys.plan(projectId);
    case "run":
      return queryKeys.run(projectId);
    case "tasks":
      return queryKeys.tasks(projectId);
    case "sources":
      return queryKeys.sources(projectId);
    case "knowledge":
      return queryKeys.knowledge(projectId);
    case "claims":
      return queryKeys.claims(projectId);
    case "graph":
      return queryKeys.graph(projectId);
    case "coverage":
      return queryKeys.coverage(projectId);
    case "gaps":
      return queryKeys.gaps(projectId);
    case "timeline":
      return queryKeys.timeline(projectId);
    case "assistantContext":
      return queryKeys.assistantContext(projectId);
    case "projects":
      return queryKeys.projects;
  }
}

/** Builds the concrete query keys one event invalidates. Exported for tests. */
export function queryKeysForEvent(
  eventType: string,
  projectId: string,
): readonly (readonly unknown[])[] {
  // The forwarded research events (ipc.rs `ResearchEvent`) carry no
  // project_id — runs are single-user/单项目 active in V0.1, so the events
  // are attributed to the ACTIVE project's caches. If background
  // multi-project runs arrive, the envelope needs a project id first.
  const kinds = invalidationKindsForEventType(eventType);
  if (projectId === "") {
    return kinds.includes("projects") ? [queryKeys.projects] : [];
  }
  return kinds.map((kind) => queryKeyForKind(kind, projectId));
}

/** Subscribes to morpho://events and invalidates the mapped query caches. */
export function ResearchEventBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenResearchEvents((event) => {
      const projectId = useWorkspaceStore.getState().activeProjectId;
      for (const key of queryKeysForEvent(event.event_type, projectId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }).then((fn) => {
      if (disposed) fn(); // listener resolved after unmount — release it
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);

  return null;
}

/** Purges project-scoped caches on every active-project switch. */
export function SessionInvalidationBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (state.activeProjectId !== previous.activeProjectId) {
        // Synchronous and inside the store update: the purge completes
        // before React re-renders the next project's views, so no stale
        // project-scoped entry can survive the switch.
        purgeVolatileSessionState(queryClient);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  return null;
}

/** Convenience mount for App: both bridges, no output. */
export function AppBridges() {
  return (
    <>
      <ResearchEventBridge />
      <SessionInvalidationBridge />
    </>
  );
}
