import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { listenResearchEvents } from "@/services/tauriTransport";
import { runService } from "@/services/api";
import { queryKeys, useProjects } from "@/services/queries";
import { purgeVolatileSessionState } from "@/services/sessionState";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { ResearchRun } from "@/types/domain";

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
 *
 *  3. DeliveryWatchBridge — bounded tracking of result delivery through the
 *     existing read API (audit A2): execution terminal ≠ domain results
 *     committed. While any project's terminal run has a pending (or
 *     durable-failed) delivery, the watch polls `run.get` per project; the
 *     moment a delivery flips to `delivered`, THAT project's domain caches
 *     invalidate — attribution follows the delivering project, never the
 *     active selection. Polling stops entirely when nothing is in flight;
 *     it never relies on the user refreshing, switching views, or focusing
 *     the window, and the core additionally re-emits the persisted terminal
 *     run event right after the commit (state.rs, audit A2).
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

/** One run-owning project as observed in the ["run", *] query cache. */
export interface RunOwnerEntry {
  projectId: string;
  runId: string;
}

/**
 * Resolves which project's caches an event belongs to (audit A2): the run
 * query cache holds (projectId → runId) mappings from the read API, so a
 * background project A run's events invalidate A even while project B is
 * active. Unknown runs fall back to the active project — the V0.1
 * single-active-run behavior.
 */
export function resolveEventProject(
  runId: string | undefined,
  runOwners: readonly RunOwnerEntry[],
  activeProjectId: string,
): string {
  if (runId) {
    const owner = runOwners.find((entry) => entry.runId === runId);
    if (owner) return owner.projectId;
  }
  return activeProjectId;
}

/** The run-id owners visible in the client's ["run", *] cache entries. */
function runOwnersFromCache(queryClient: QueryClient): RunOwnerEntry[] {
  return queryClient
    .getQueriesData<ResearchRun | null>({ queryKey: ["run"] })
    .map(([key, run]) => ({
      projectId: String(key[1] ?? ""),
      runId: run?.id ?? "",
    }))
    .filter((entry) => entry.projectId !== "" && entry.runId !== "");
}

/** Subscribes to morpho://events and invalidates the mapped query caches. */
export function ResearchEventBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenResearchEvents((event) => {
      const activeProjectId = useWorkspaceStore.getState().activeProjectId;
      const projectId = resolveEventProject(
        event.run_id || undefined,
        runOwnersFromCache(queryClient),
        activeProjectId,
      );
      for (const key of queryKeysForEvent(event.event_type, projectId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // Wake the delivery watch on run lifecycle events (audit A2): a run
      // started after the watch's last sample re-arms its polling so the
      // terminal+pending delivery window is never slept through.
      if (event.event_type.startsWith("run.")) {
        void queryClient.invalidateQueries({ queryKey: ["delivery-watch"] });
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

/* ------------------------------------------------------------------ */
/* Delivery watch (audit A2)                                           */
/* ------------------------------------------------------------------ */

/** Bounded poll cadence (ms) while any project's terminal run still has a
 * pending delivery — the core re-arms delivery on its own schedule, and the
 * moment the results commit the invalidations below fire. */
const DELIVERY_WATCH_ACTIVE_MS = 900;
/** Slow re-arm watch for durable-failed deliveries: recovery stays possible
 * (the core retries with backoff), so a slow bounded watch is honest — but
 * no permanent high-speed polling. */
const DELIVERY_WATCH_FAILED_MS = 5_000;

/** One project's delivery snapshot as the watch sees it. */
export interface DeliverySnapshot {
  projectId: string;
  runId: string;
  /** Execution status of the run (TaskState). */
  status: string;
  deliveryStatus: string;
}

/**
 * Bounded tracking of result delivery through the EXISTING read API
 * (`run.get` → `run_latest_get`, audit A2): a terminal execution status
 * alone never means the domain results are committed. Poll while any run's
 * delivery is still pending (fast — the terminal+pending window must never
 * be slept through) or durable-failed (slow re-arm watch); stop completely
 * otherwise. The watch wakes on every run.* event (see
 * ResearchEventBridge), so a run started after the last sample immediately
 * re-arms the polling. Exported for tests.
 */
export function deliveryWatchInterval(
  snapshots: Readonly<Record<string, DeliverySnapshot>> | undefined,
): number | false {
  if (!snapshots) return DELIVERY_WATCH_ACTIVE_MS;
  const values = Object.values(snapshots);
  if (values.some((snapshot) => snapshot.deliveryStatus === "pending")) {
    return DELIVERY_WATCH_ACTIVE_MS;
  }
  if (values.some((snapshot) => snapshot.deliveryStatus === "failed")) {
    return DELIVERY_WATCH_FAILED_MS;
  }
  return false;
}

/** Domain regions a completed delivery can change — attributed to the
 * DELIVERING project, never to the currently selected one. */
const DELIVERY_SETTLED_KEYS = (projectId: string) =>
  [
    queryKeys.run(projectId),
    queryKeys.tasks(projectId),
    queryKeys.sources(projectId),
    queryKeys.knowledge(projectId),
    queryKeys.claims(projectId),
    queryKeys.graph(projectId),
    queryKeys.coverage(projectId),
    queryKeys.gaps(projectId),
    queryKeys.timeline(projectId),
  ] as const;

/**
 * Informs the invalidation keys for projects whose delivery flipped to
 * `delivered` between two watch snapshots. Pure and exported for tests.
 * The FIRST observation (no previous snapshot) never counts: a run already
 * delivered when the app mounts must not trigger a spurious invalidation
 * storm.
 */
export function projectsDeliveredBetween(
  previous: Readonly<Record<string, DeliverySnapshot>> | undefined,
  current: Readonly<Record<string, DeliverySnapshot>> | undefined,
): string[] {
  if (!current || !previous) return [];
  return Object.values(current)
    .filter((snapshot) => {
      const before = previous[snapshot.projectId];
      return (
        before !== undefined &&
        before.deliveryStatus !== "delivered" &&
        snapshot.deliveryStatus === "delivered"
      );
    })
    .map((snapshot) => snapshot.projectId);
}

/**
 * App-level bounded delivery tracker (audit A2): execution terminal ≠
 * results committed. One query watches every known project's latest run
 * through the existing read API; when a project's delivery flips to
 * `delivered`, THAT project's domain caches invalidate — attribution
 * follows the delivering project, not the active selection, so a
 * background run lands while the user works elsewhere. The watch stops
 * polling entirely when no terminal run has an undelivered/failed
 * delivery; it never depends on the user refreshing, switching views, or
 * focusing the window.
 */
export function DeliveryWatchBridge() {
  const queryClient = useQueryClient();
  const projects = useProjects().data;
  const projectIds = (projects ?? []).map((project) => project.id);
  const previousRef = useRef<Record<string, DeliverySnapshot> | undefined>(undefined);

  const watch = useQuery({
    // The key follows the known project list; a new project restarts the
    // watch for it.
    queryKey: ["delivery-watch", projectIds],
    queryFn: async (): Promise<Record<string, DeliverySnapshot>> => {
      const entries = await Promise.all(
        projectIds.map(async (projectId) => {
          const run = await runService.get({ project_id: projectId });
          if (run) {
            // Feed the canonical run cache (audit A2 attribution): the
            // watch is the only component that sees EVERY project's run,
            // so event→project resolution never depends on the user having
            // visited the run's project.
            queryClient.setQueryData(queryKeys.run(projectId), run);
          }
          const snapshot: DeliverySnapshot | null = run
            ? {
                projectId,
                runId: run.id,
                status: run.state,
                deliveryStatus: run.delivery_status ?? "unknown",
              }
            : null;
          return [projectId, snapshot] as const;
        }),
      );
      return Object.fromEntries(
        entries.filter((entry): entry is readonly [string, DeliverySnapshot] => entry[1] !== null),
      );
    },
    refetchInterval: (query) =>
      deliveryWatchInterval(query.state.data as Record<string, DeliverySnapshot> | undefined),
    refetchIntervalInBackground: true,
  });

  const snapshots = watch.data;
  useEffect(() => {
    if (!snapshots) return;
    const delivered = projectsDeliveredBetween(previousRef.current, snapshots);
    previousRef.current = snapshots;
    for (const projectId of delivered) {
      for (const key of DELIVERY_SETTLED_KEYS(projectId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    }
  }, [snapshots, queryClient]);

  return null;
}

/** Convenience mount for App: all bridges, no output. */
export function AppBridges() {
  return (
    <>
      <ResearchEventBridge />
      <SessionInvalidationBridge />
      <DeliveryWatchBridge />
    </>
  );
}
