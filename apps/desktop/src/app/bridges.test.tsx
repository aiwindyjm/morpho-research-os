import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResearchEventBridge,
  SessionInvalidationBridge,
  invalidationKindsForEventType,
  queryKeysForEvent,
} from "./bridges";
import { MORPHO_EVENTS_CHANNEL, type TauriEventListener } from "@/services/tauriTransport";
import { queryKeys } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { PROJECT_A_ID, PROJECT_B_ID } from "@/services/mocks/fixtures-a";

/**
 * App-level bridges: morpho://events → TanStack Query invalidations, and
 * the proactive session purge on project switch (services/sessionState.ts
 * integration point).
 */

const PROJECT_ID = "7f000000-0000-7000-8000-000000000001";

describe("event kind → invalidation mapping", () => {
  it("maps task events onto the run/tasks/timeline/assistant regions", () => {
    expect(invalidationKindsForEventType("task.started")).toEqual([
      "run",
      "tasks",
      "timeline",
      "assistantContext",
    ]);
  });

  it("widens task.completed and run.completed to the content regions", () => {
    const kinds = invalidationKindsForEventType("run.completed");
    for (const expected of [
      "run",
      "tasks",
      "timeline",
      "sources",
      "knowledge",
      "claims",
      "graph",
      "coverage",
      "gaps",
      "projects",
      "assistantContext",
    ]) {
      expect(kinds).toContain(expected);
    }
    expect(invalidationKindsForEventType("task.completed")).toContain("knowledge");
  });

  it("maps plan/source/claim/knowledge/review prefixes to their regions", () => {
    expect(invalidationKindsForEventType("plan.approved")).toContain("plan");
    expect(invalidationKindsForEventType("source.fetched")).toContain("sources");
    expect(invalidationKindsForEventType("claim.created")).toContain("claims");
    expect(invalidationKindsForEventType("knowledge.created")).toContain("graph");
    expect(invalidationKindsForEventType("review.requested")).toContain("assistantContext");
  });

  it("ignores unknown event kinds instead of refetching everything", () => {
    expect(invalidationKindsForEventType("coffee.brewing")).toEqual([]);
    expect(queryKeysForEvent("coffee.brewing", PROJECT_ID)).toEqual([]);
  });

  it("with no active project only the global projects region is invalidated", () => {
    expect(queryKeysForEvent("run.completed", "")).toEqual([queryKeys.projects]);
    expect(queryKeysForEvent("task.started", "")).toEqual([]);
  });

  it("builds project-scoped keys for the active project", () => {
    expect(queryKeysForEvent("task.started", PROJECT_ID)).toEqual([
      queryKeys.run(PROJECT_ID),
      queryKeys.tasks(PROJECT_ID),
      queryKeys.timeline(PROJECT_ID),
      queryKeys.assistantContext(PROJECT_ID),
    ]);
  });
});

describe("ResearchEventBridge", () => {
  let registered: ((event: { payload: unknown }) => void) | undefined;
  let unlisten: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    unlisten = vi.fn();
    const listen = vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      registered = handler;
      return unlisten;
    });
    window.__TAURI__ = {
      core: { invoke: vi.fn(async () => ({ schema_version: "1.0", request_id: "r", data: null })) },
      event: { listen: listen as unknown as TauriEventListener },
    };
  });

  afterEach(() => {
    delete window.__TAURI__;
    vi.restoreAllMocks();
  });

  it("invalidates the mapped query keys for incoming events", async () => {
    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    useWorkspaceStore.setState({ activeProjectId: PROJECT_A_ID });

    render(
      <QueryClientProvider client={client}>
        <ResearchEventBridge />
      </QueryClientProvider>,
    );
    await vi.waitFor(() => expect(registered).toBeDefined());

    act(() => {
      registered?.({
        payload: {
          schema: "research.event.v1",
          run_id: "run-1",
          task_id: null,
          sequence: 3,
          timestamp_ms: 1700000000000,
          event_type: "task.completed",
          payload: {},
        },
      });
    });

    await vi.waitFor(() => {
      const invalidated = invalidateSpy.mock.calls.map((call) => call[0]);
      expect(invalidated).toContainEqual({ queryKey: queryKeys.tasks(PROJECT_A_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.knowledge(PROJECT_A_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.projects });
    });
    // The channel subscription is the Rust re-emission channel.
    expect((window.__TAURI__?.event?.listen as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      MORPHO_EVENTS_CHANNEL,
    );
  });
});

describe("SessionInvalidationBridge", () => {
  it("purges project-scoped caches and volatile flags on project switch", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.tasks(PROJECT_A_ID), []);
    client.setQueryData(queryKeys.assistantContext(PROJECT_A_ID), undefined);
    client.setQueryData(queryKeys.projects, []);
    useWorkspaceStore.setState({
      activeProjectId: PROJECT_A_ID,
      activeView: "overview",
      assistantOpen: true,
      sidebarDrawerOpen: true,
    });

    const { unmount } = render(
      <QueryClientProvider client={client}>
        <SessionInvalidationBridge />
      </QueryClientProvider>,
    );

    expect(client.getQueryState(queryKeys.tasks(PROJECT_A_ID))).toBeDefined();

    act(() => {
      useWorkspaceStore.getState().setActiveProject(PROJECT_B_ID);
    });

    // Project-scoped entries are gone; the global projects list survives.
    expect(client.getQueryState(queryKeys.tasks(PROJECT_A_ID))).toBeUndefined();
    expect(client.getQueryState(queryKeys.projects)).toBeDefined();
    // Volatile overlay flags reset with the purge.
    expect(useWorkspaceStore.getState().assistantOpen).toBe(false);
    expect(useWorkspaceStore.getState().sidebarDrawerOpen).toBe(false);
    // Navigation decisions stay with the caller: activeView untouched here.
    expect(useWorkspaceStore.getState().activeView).toBe("overview");
    expect(useWorkspaceStore.getState().activeProjectId).toBe(PROJECT_B_ID);

    unmount();
  });
});
