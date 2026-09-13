import type { QueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Proactive session invalidation (AGENTS.md: "state invalidated by project
 * lock, permission revocation, or version invalidation must be cleared
 * proactively").
 *
 * W2-05 INTEGRATION POINT — read this before wiring event listeners.
 * ---------------------------------------------------------------------
 * The real event sources arrive with W2-05 (Tauri IPC). The transport
 * contract is frozen until then, so NO event names are defined here and
 * NO speculative listeners exist in this codebase yet. When W2-05 lands:
 *
 *   1. Subscribe to the W2-05 transport events that report a project
 *      lock, a permission revocation, or a version invalidation for the
 *      active project (event names are W2-05's to define — do not guess).
 *   2. In the handler, call:
 *
 *        purgeVolatileSessionState(queryClient);
 *        useWorkspaceStore.getState().setActiveProject("");
 *        useWorkspaceStore.getState().setActiveView("projects");
 *
 *      Purge FIRST, then navigate: purged project-scoped queries are
 *      gone, and moving to the projects view (a caller decision, not
 *      this function's) remounts only project-list content, so nothing
 *      refetches a project the user may no longer be allowed to read.
 *   3. Keep this call synchronous and immediate — the invalidation must
 *      happen proactively on the event, never lazily on the next render.
 *
 * What this function clears:
 *   - Every project-scoped TanStack Query cache entry. All keys built by
 *     `queryKeys` in services/queries.ts carry a project id in some
 *     position after the first element (e.g. ["plan", projectId],
 *     ["assistant", "context", projectId], ["evidence", projectId,
 *     claimId]); the only global key is ["projects"] (length 1). The
 *     predicate below removes exactly the scoped entries.
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
