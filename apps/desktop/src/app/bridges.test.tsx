import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeliveryWatchBridge,
  ResearchEventBridge,
  SessionInvalidationBridge,
  deliveryWatchInterval,
  invalidationKindsForEventType,
  projectsDeliveredBetween,
  queryKeysForEvent,
  resolveEventProject,
} from "./bridges";
import { MORPHO_EVENTS_CHANNEL, type TauriEventListener } from "@/services/tauriTransport";
import { queryKeys } from "@/services/queries";
import { projectService, runService } from "@/services/api";
import type { Project, ResearchRun } from "@/types/domain";
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

/* ------------------------------------------------------------------ */
/* Delivery attribution + bounded watch (audit A2)                     */
/* ------------------------------------------------------------------ */

describe("resolveEventProject", () => {
  it("attributes a background project's run to that project, not the active one", () => {
    const owners = [
      { projectId: PROJECT_A_ID, runId: "run-bg" },
      { projectId: PROJECT_B_ID, runId: "run-foreground" },
    ];
    // The user is viewing project B while project A's run emits events.
    expect(resolveEventProject("run-bg", owners, PROJECT_B_ID)).toBe(PROJECT_A_ID);
    expect(resolveEventProject("run-foreground", owners, PROJECT_B_ID)).toBe(PROJECT_B_ID);
  });

  it("falls back to the active project for unknown runs", () => {
    expect(resolveEventProject("never-seen", [], PROJECT_A_ID)).toBe(PROJECT_A_ID);
    expect(resolveEventProject(undefined, [], PROJECT_B_ID)).toBe(PROJECT_B_ID);
  });
});

describe("ResearchEventBridge attribution", () => {
  let registered: ((event: { payload: unknown }) => void) | undefined;

  beforeEach(() => {
    const listen = vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      registered = handler;
      return vi.fn();
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

  it("invalidates the OWNING project's caches for a background run's event (audit A2)", async () => {
    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    // The run cache knows project A owns run-bg (read-API data).
    client.setQueryData(queryKeys.run(PROJECT_A_ID), {
      id: "run-bg",
      project_id: PROJECT_A_ID,
    } as unknown as ResearchRun);
    // The user is viewing project B.
    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });

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
          run_id: "run-bg",
          task_id: null,
          sequence: 9,
          timestamp_ms: 1700000000000,
          event_type: "run.completed",
          payload: {},
        },
      });
    });

    await vi.waitFor(() => {
      const invalidated = invalidateSpy.mock.calls.map((call) => call[0]);
      // The delivering project's regions refresh…
      expect(invalidated).toContainEqual({ queryKey: queryKeys.sources(PROJECT_A_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.graph(PROJECT_A_ID) });
      // …the run lifecycle event wakes the bounded delivery watch…
      expect(invalidated).toContainEqual({ queryKey: ["delivery-watch"] });
      // …and the viewed project's caches are NOT wrongly refreshed.
      expect(invalidated).not.toContainEqual({ queryKey: queryKeys.sources(PROJECT_B_ID) });
      expect(invalidated).not.toContainEqual({ queryKey: queryKeys.graph(PROJECT_B_ID) });
    });
  });
});

describe("deliveryWatchInterval", () => {
  const snapshot = (status: string, deliveryStatus: string) => ({
    projectId: PROJECT_A_ID,
    runId: "run-1",
    status,
    deliveryStatus,
  });

  it("polls fast while a terminal run's delivery is pending", () => {
    expect(deliveryWatchInterval(undefined)).toBe(900);
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("COMPLETED", "pending") }),
    ).toBe(900);
  });

  it("watches durable-failed deliveries slowly (re-arm stays observable)", () => {
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("COMPLETED", "failed") }),
    ).toBe(5_000);
  });

  it("stops completely once nothing is in flight", () => {
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("COMPLETED", "delivered") }),
    ).toBe(false);
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("CANCELLED", "failed") }),
    ).toBe(5_000);
    // A still-executing run keeps the fast watch armed: the pump must never
    // sleep through the terminal+pending delivery window (review P2-1).
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("RUNNING", "pending") }),
    ).toBe(900);
    expect(deliveryWatchInterval({})).toBe(false);
    expect(
      deliveryWatchInterval({ [PROJECT_A_ID]: snapshot("RUNNING", "unknown") }),
    ).toBe(false);
  });
});

describe("projectsDeliveredBetween", () => {
  const snap = (deliveryStatus: string) => ({
    projectId: PROJECT_A_ID,
    runId: "run-1",
    status: "COMPLETED",
    deliveryStatus,
  });

  it("reports exactly the projects whose delivery flipped to delivered", () => {
    const byProject = (deliveryStatus: string) => ({
      [PROJECT_A_ID]: snap(deliveryStatus),
    });
    // The FIRST observation never counts: a run already delivered at mount
    // must not trigger a spurious invalidation storm (review P3-5).
    expect(projectsDeliveredBetween(undefined, byProject("delivered"))).toEqual([]);
    expect(
      projectsDeliveredBetween(byProject("pending"), byProject("delivered")),
    ).toEqual([PROJECT_A_ID]);
    expect(
      projectsDeliveredBetween(byProject("failed"), byProject("delivered")),
    ).toEqual([PROJECT_A_ID]);
    // Already delivered → not a new transition.
    expect(
      projectsDeliveredBetween(byProject("delivered"), byProject("delivered")),
    ).toEqual([]);
    // Failed is honest, not delivered.
    expect(
      projectsDeliveredBetween(byProject("pending"), byProject("failed")),
    ).toEqual([]);
  });
});

describe("DeliveryWatchBridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const project = (id: string): Project =>
    ({
      id,
      name: id,
      description: "",
      status: "active",
      created_at: "",
      updated_at: "",
      progress: null,
    }) as unknown as Project;

  const run = (deliveryStatus: string): ResearchRun =>
    ({
      id: "run-1",
      project_id: PROJECT_A_ID,
      plan_id: "plan-1",
      state: "COMPLETED",
      delivery_status: deliveryStatus,
      config_snapshot: {} as never,
      plan_snapshot_title: "T",
      started_at: null,
      updated_at: "",
    }) as ResearchRun;

  it("invalidates the DELIVERING project's caches when a pending delivery lands", async () => {
    // Project A's run delivered in the background; the user views project B.
    vi.spyOn(projectService, "list").mockResolvedValue([
      project(PROJECT_A_ID),
      project(PROJECT_B_ID),
    ]);
    let deliveryStatus = "pending";
    vi.spyOn(runService, "get").mockImplementation(async (request) =>
      request.project_id === PROJECT_A_ID ? run(deliveryStatus) : null,
    );
    useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });

    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <DeliveryWatchBridge />
      </QueryClientProvider>,
    );

    // First observation: still pending — nothing invalidates yet.
    await vi.waitFor(() => {
      expect(runService.get).toHaveBeenCalled();
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    // The delayed delivery commits (audit A2: retry success): the next
    // watch observation flips to delivered…
    deliveryStatus = "delivered";
    await act(async () => {
      await client.refetchQueries({ queryKey: ["delivery-watch"] });
    });

    // …and ONLY the delivering project's caches invalidate — not the
    // viewed project's.
    await vi.waitFor(() => {
      const invalidated = invalidateSpy.mock.calls.map((call) => call[0]);
      expect(invalidated).toContainEqual({ queryKey: queryKeys.sources(PROJECT_A_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.coverage(PROJECT_A_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.claims(PROJECT_A_ID) });
      expect(invalidated).not.toContainEqual({ queryKey: queryKeys.sources(PROJECT_B_ID) });
      expect(invalidated).toContainEqual({ queryKey: queryKeys.projects });
    });
  });
});
