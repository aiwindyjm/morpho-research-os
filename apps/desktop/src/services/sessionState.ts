import type { QueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Proactive session invalidation (AGENTS.md: "state invalidated by project
 * lock, permission revocation, or version invalidation must be cleared
 * proactively").
 *
 * WIRED CALL SITES (app/bridges.tsx):
 * ---------------------------------------------------------------------
 * 1. Project switch — SessionInvalidationBridge subscribes to the
 *    workspace store and calls this function synchronously on every
 *    activeProjectId change, before the next project's views mount.
 * 2. Event kinds — the frozen research-event vocabulary
 *    (packages/schemas/event.v1.json) defines NO project-lock,
 *    permission-revocation, or version-invalidation kinds today, so no
 *    event listener exists for them (inventing event names is forbidden).
 *    When such a kind is ratified, its listener must call:
 *
 *        purgeVolatileSessionState(queryClient);
 *        useWorkspaceStore.getState().setActiveProject("");
 *        useWorkspaceStore.getState().setActiveView("projects");
 *
 *      Purge FIRST, then navigate: purged project-scoped queries are
 *      gone, and moving to the projects view (a caller decision, not
 *      this function's) remounts only project-list content, so nothing
 *      refetches a project the user may no longer be allowed to read.
 *    Keep that call synchronous and immediate — the invalidation must
 *    happen proactively on the event, never lazily on the next render.
 *
 * What this function clears:
 *   - Every project-scoped TanStack Query cache entry. All keys built by
 *     `queryKeys` in services/queries.ts carry a project id in some
 *     position after the first element (e.g. ["plan", projectId],
 *     ["assistant", "context", projectId], ["evidence", projectId,
 *     claimId]); the only global keys are ["projects"], ["core","info"],
 *     and ["secrets","providers"] — the latter two simply refetch when
 *     next mounted. The predicate below removes exactly the scoped
 *     entries.
 *   - Volatile workspace-store overlay flags via the store's
 *     `resetVolatileState()` action.
 *
 * What this function must NOT clear (invariants):
 *   - Journal localStorage (services/journal.ts, "morpho.journal.*"
 *     keys) is explicit private user data (DO_NOT_BREAK #11/#12) — it
 *     survives session invalidation untouched.
 *   - activeProjectId/activeView are navigation decisions; the caller
 *     that reacts to the invalidation event re-derives them (typically
 *     back to the projects view), not this function.
 *   - The global ["projects"] list: it is not project-scoped payload,
 *     cheap to refetch, and useful for the post-invalidation navigation.
 *   - The mutation cache is left alone; in-flight mutations fail through
 *     the normal transport error path (MorphoError → pages).
 *
 * Pure and synchronous: no I/O, no timers, safe to call from any event
 * handler or test.
 */
export function purgeVolatileSessionState(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey.length > 1,
  });
  useWorkspaceStore.getState().resetVolatileState();
}
