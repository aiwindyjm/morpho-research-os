import { beforeEach, describe, expect, it } from "vitest";
import { createQueryClient } from "@/app/queryClient";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { addEntry, listEntries } from "./journal";
import { purgeVolatileSessionState } from "./sessionState";
import { queryKeys } from "./queries";

/**
 * Proactive session invalidation (AGENTS.md: lock / permission /
 * version invalidation must clear state proactively). Seeds the cache
 * with the real queryKeys builders from services/queries.ts, dirties
 * the workspace store, runs the purge, and asserts exactly what may be
 * cleared — and what must survive.
 */

const PROJECT_ID = "proj-1";
const TODAY = "2026-09-12";

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    activeProjectId: PROJECT_ID,
    activeView: "plan",
    assistantOpen: true,
    sidebarDrawerOpen: true,
  });
});

describe("purgeVolatileSessionState", () => {
  it("removes every project-scoped query cache entry and keeps the global projects list", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.projects, [{ id: PROJECT_ID }]);
    queryClient.setQueryData(queryKeys.plan(PROJECT_ID), { steps: [] });
    queryClient.setQueryData(queryKeys.config(PROJECT_ID), { model: "gpt" });
    queryClient.setQueryData(queryKeys.run(PROJECT_ID), { state: "RUNNING" });
    queryClient.setQueryData(queryKeys.evidence(PROJECT_ID, "claim-1"), []);
    queryClient.setQueryData(queryKeys.assistantContext(PROJECT_ID), {});

    purgeVolatileSessionState(queryClient);

    expect(queryClient.getQueryData(queryKeys.plan(PROJECT_ID))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.config(PROJECT_ID))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.run(PROJECT_ID))).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.evidence(PROJECT_ID, "claim-1")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.assistantContext(PROJECT_ID)),
    ).toBeUndefined();
    // ["projects"] is not project-scoped payload; it feeds the post-
    // invalidation navigation and survives the purge.
    expect(queryClient.getQueryData(queryKeys.projects)).toEqual([
      { id: PROJECT_ID },
    ]);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  it("resets volatile UI flags but leaves navigation state for the caller", () => {
    const queryClient = createQueryClient();

    purgeVolatileSessionState(queryClient);

    const state = useWorkspaceStore.getState();
    expect(state.assistantOpen).toBe(false);
    expect(state.sidebarDrawerOpen).toBe(false);
    // activeProjectId/activeView are navigation decisions — the W2-05
    // event handler re-derives them (typically to the projects view).
    expect(state.activeProjectId).toBe(PROJECT_ID);
    expect(state.activeView).toBe("plan");
  });

  it("never touches journal localStorage (explicit private user data)", () => {
    addEntry(TODAY, "user", "仅本地保存的私人日志");
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.plan(PROJECT_ID), { steps: [] });

    purgeVolatileSessionState(queryClient);

    expect(listEntries(TODAY).map((entry) => entry.content)).toEqual([
      "仅本地保存的私人日志",
    ]);
  });
});

describe("useWorkspaceStore.resetVolatileState", () => {
  it("clears only the overlay flags, leaving state shape and navigation intact", () => {
    useWorkspaceStore.getState().resetVolatileState();

    const state = useWorkspaceStore.getState();
    expect(state).toMatchObject({
      activeProjectId: PROJECT_ID,
      activeView: "plan",
      assistantOpen: false,
      sidebarDrawerOpen: false,
    });
  });
});
