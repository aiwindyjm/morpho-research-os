import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockBackend } from "./mocks/backend";
import { MorphoError } from "./errors";
import {
  getTransport,
  getTransportKind,
  resetTransport,
  setBuildModeOverride,
} from "./transportProvider";
import {
  MORPHO_EVENTS_CHANNEL,
  createTauriTransport,
  listenResearchEvents,
  type ResearchEvent,
  type TauriEventListener,
  type TauriInvoke,
} from "./tauriTransport";

/**
 * W2-05 Tauri transport boundary checks against the committed Rust command
 * surface (apps/desktop/src-tauri/src/commands.rs): a fake
 * `window.__TAURI__` (assigned and cleaned up around every test) stands in
 * for the desktop bridge; invoke stubs answer with the real IpcResponse
 * envelope shapes.
 */

/* ------------------------------------------------------------------ */
/* Fake global bridge                                                  */
/* ------------------------------------------------------------------ */

function installFakeTauri(options: { invoke: TauriInvoke; listen?: TauriEventListener }) {
  window.__TAURI__ = {
    core: { invoke: options.invoke },
    event: options.listen ? { listen: options.listen } : {},
  };
  return () => {
    delete window.__TAURI__;
  };
}

/** IpcResponse::ok shape (src-tauri/src/ipc.rs). */
function okEnvelope(data: unknown) {
  return { schema_version: "1.0", request_id: "req-test-1", data };
}

/* ------------------------------------------------------------------ */
/* Wire fixtures (serde JSON of the Rust records)                      */
/* ------------------------------------------------------------------ */

const PROJECT_ID = "7f000000-0000-7000-8000-000000000001";
const PLAN_ID = "7f000000-0000-7000-8000-000000000002";
const RUN_ID = "7f000000-0000-7000-8000-000000000003";
const JOB_ID = "7f000000-0000-7000-8000-000000000004";
const CONFIG_ID = "7f000000-0000-7000-8000-000000000005";
const TASK_ID = "7f000000-0000-7000-8000-000000000006";

const projectRecord = {
  id: PROJECT_ID,
  name: "BCI",
  description: "notes",
  status: "active",
  created_at: 1700000000000,
  updated_at: 1700000000500,
};

const planWithTasks = {
  plan: {
    id: PLAN_ID,
    project_id: PROJECT_ID,
    research_config_id: CONFIG_ID,
    title: "T",
    status: "draft",
    created_at: 1700000000000,
    updated_at: 1700000000500,
  },
  tasks: [
    {
      id: TASK_ID,
      plan_id: PLAN_ID,
      section_id: null,
      run_id: null,
      title: "search theory",
      task_type: "search",
      status: "PENDING",
      idempotency_key: "k-1",
      checkpoint: null,
      retry_count: 0,
      max_retries: 3,
      cache_ref: null,
      result_ref: null,
      error_ref: null,
      created_at: 1700000000000,
      updated_at: 1700000000500,
    },
  ],
};

const runStarted = { project_id: PROJECT_ID, run_id: RUN_ID, job_id: JOB_ID };

const rustCoverageReport = {
  project_id: PROJECT_ID,
  overall: 0.18,
  components: {
    task_completion: 0,
    knowledge_breadth: 0.2,
    evidence_density: 0,
    source_diversity: 0,
  },
  dimensions: [
    {
      dimension: "theory",
      coverage: 0.12,
      components: {
        task_completion: 0,
        knowledge_breadth: 0.2,
        evidence_density: 0,
        source_diversity: 0,
      },
      tasks_total: 1,
      tasks_completed: 0,
      knowledge_nodes: 0,
      evidence_items: 0,
      quality_sources: 0,
      source_types: [],
      reasons: ["维度覆盖率低于阈值"],
      gap: null,
    },
  ],
  gaps: [
    {
      dimension: "theory",
      trigger: "coverage_below_threshold",
      rule: "coverage < 0.6",
      detail: "维度 theory 覆盖不足。",
      quality_sources_found: 0,
      coverage: 0.12,
    },
  ],
  computed_at: 1700000000123,
};

const researchEvent: ResearchEvent = {
  schema: "research.event.v1",
  run_id: RUN_ID,
  task_id: null,
  sequence: 7,
  timestamp_ms: 1700000000000,
  event_type: "run.progress",
  payload: { n: 1 },
};

/* ------------------------------------------------------------------ */
/* Shared cleanup                                                      */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  mockBackend.reset();
});

afterEach(() => {
  delete window.__TAURI__;
  window.localStorage.removeItem("morpho.transport");
  window.history.pushState({}, "", "/");
  setBuildModeOverride(undefined);
  vi.restoreAllMocks();
  resetTransport();
});

/* ------------------------------------------------------------------ */
/* Command mapping                                                     */
/* ------------------------------------------------------------------ */

describe("tauri transport command mapping", () => {
  it("maps project.list onto project_list with the IpcRequest envelope", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope([projectRecord]));
    const projects = await createTauriTransport({ invoke }).invoke("project.list", {});

    expect(invoke).toHaveBeenCalledWith("project_list", {
      request: { schema_version: "1.0", request_id: expect.any(String), data: {} },
    });
    expect(projects).toEqual([
      {
        id: PROJECT_ID,
        name: "BCI",
        description: "notes",
        created_at: "2023-11-14T22:13:20.000Z",
        updated_at: "2023-11-14T22:13:20.500Z",
      },
    ]);
  });

  it("maps run.start onto plan_list + run_start with plan_id/approve_plan", async () => {
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "plan_list") return okEnvelope([planWithTasks]);
      if (command === "run_start") return okEnvelope(runStarted);
      throw new Error(`unexpected rust command '${command}'`);
    });
    const run = await createTauriTransport({ invoke }).invoke("run.start", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "plan_list", {
      request: {
        schema_version: "1.0",
        request_id: expect.any(String),
        data: { project_id: PROJECT_ID },
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "run_start", {
      request: {
        schema_version: "1.0",
        request_id: expect.any(String),
        data: { plan_id: PLAN_ID, approve_plan: true },
      },
    });
    expect(run).toMatchObject({
      id: RUN_ID,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
      state: "RUNNING",
      plan_snapshot_title: "T",
    });
  });

  it("maps coverage.get onto coverage_get and adapts the Rust report", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(rustCoverageReport));
    const report = await createTauriTransport({ invoke }).invoke("coverage.get", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "coverage_get",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(report.project_id).toBe(PROJECT_ID);
    expect(report.computed_at).toBe("2023-11-14T22:13:20.123Z");
    expect(report.dimensions[0]).toMatchObject({
      dimension: "theory",
      coverage: 0.12,
      inputs: { tasks_total: 1, tasks_completed: 0 },
    });
    expect("gaps" in report).toBe(false);
  });

  it("bridges gap.list through coverage_get with pending proposals", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(rustCoverageReport));
    const report = await createTauriTransport({ invoke }).invoke("gap.list", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith("coverage_get", expect.anything());
    expect(report.gaps[0]).toMatchObject({
      id: `gap:${PROJECT_ID}:theory`,
      dimension: "theory",
      trigger: "coverage_below_threshold",
      proposal_status: "pending_approval",
      created_task_id: null,
    });
  });

  it("maps timeline.get onto events_list and orders entries by time", async () => {
    const events = [
      { id: TASK_ID, run_id: RUN_ID, task_id: null, sequence: 1, event_type: "run.completed", payload: "{\"status\":\"ok\"}", created_at: 1700000000500 },
      { id: PLAN_ID, run_id: RUN_ID, task_id: null, sequence: 2, event_type: "task.started", payload: "{}", created_at: 1700000000000 },
    ];
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(events));
    const timeline = await createTauriTransport({ invoke }).invoke("timeline.get", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "events_list",
      expect.objectContaining({
        request: expect.objectContaining({
          data: { project_id: PROJECT_ID, run_id: null, after_sequence: 0, limit: 100 },
        }),
      }),
    );
    expect(timeline.map((entry) => entry.kind)).toEqual(["task", "run"]);
    expect(timeline[0].timestamp).toBe("2023-11-14T22:13:20.000Z");
  });

  it("surfaces a Rust CoreError envelope as a typed MorphoError", async () => {
    const invoke = vi.fn(
      async (): Promise<unknown> => ({
        schema_version: "1.0",
        request_id: "req-err-1",
        error: {
          code: "WORKER_NOT_AVAILABLE",
          user_message: "研究执行器暂不可用。",
          developer_detail: "supervisor exhausted restarts",
          retryable: false,
          correlation_id: "0188a7c0-7f00-7000-8000-00000000eeee",
        },
      }),
    );
    const error = (await createTauriTransport({ invoke })
      .invoke("run.start", { project_id: PROJECT_ID })
      .catch((caught: unknown) => caught)) as MorphoError;

    expect(error).toBeInstanceOf(MorphoError);
    expect(error.code).toBe("WORKER_NOT_AVAILABLE");
    expect(error.userMessage).toBe("研究执行器暂不可用。");
    expect(error.retryable).toBe(false);
    expect(error.correlationId).toBe("0188a7c0-7f00-7000-8000-00000000eeee");
  });

  it("maps a missing project (core null) to a typed NOT_FOUND error", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(null));
    await expect(
      createTauriTransport({ invoke }).invoke("project.get", { project_id: PROJECT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fails with VALIDATION_FAILED when the core payload drifts from the schema", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope([{ id: "not-a-uuid", name: "x", description: "", created_at: 1, updated_at: 1 }]),
    );
    await expect(
      createTauriTransport({ invoke }).invoke("project.list", {}),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("fails fast with a typed error for commands the Rust surface lacks", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope({}));
    await expect(
      createTauriTransport({ invoke }).invoke("config.get", { project_id: PROJECT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", correlationId: "local-unsupported" });
    expect(invoke).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Transport selection                                                 */
/* ------------------------------------------------------------------ */

describe("transport selection (transportProvider)", () => {
  beforeEach(() => {
    // vitest resolves import.meta.env.MODE statically, so selection tests
    // simulate a non-test build mode through the documented seam; the
    // dedicated test-mode case below clears it deliberately.
    setBuildModeOverride("development");
  });

  it("selects the Tauri transport when the global bridge exists", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope([projectRecord]));
    installFakeTauri({ invoke });
    resetTransport();

    expect(getTransportKind()).toBe("tauri");
    const projects = await getTransport().invoke("project.list", {});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(projects).toHaveLength(1);
  });

  it("falls back to the mock transport when the global is absent", async () => {
    delete window.__TAURI__;
    resetTransport();

    expect(getTransportKind()).toBe("mock");
    const projects = await getTransport().invoke("project.list", {});
    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  it("honors ?transport=mock as an escape hatch even inside the desktop window", () => {
    installFakeTauri({ invoke: vi.fn(async (): Promise<unknown> => okEnvelope([])) });
    window.history.pushState({}, "", "/?transport=mock");
    resetTransport();

    expect(getTransportKind()).toBe("mock");
  });

  it("honors localStorage morpho.transport=mock over auto-detection", () => {
    installFakeTauri({ invoke: vi.fn(async (): Promise<unknown> => okEnvelope([])) });
    window.localStorage.setItem("morpho.transport", "mock");
    resetTransport();

    expect(getTransportKind()).toBe("mock");
  });

  it("forces the mock under import.meta.env.MODE === 'test'", () => {
    setBuildModeOverride(undefined);
    installFakeTauri({ invoke: vi.fn(async (): Promise<unknown> => okEnvelope([])) });
    resetTransport();

    expect(getTransportKind()).toBe("mock");
  });
});

/* ------------------------------------------------------------------ */
/* Research events                                                     */
/* ------------------------------------------------------------------ */

describe("research event subscription", () => {
  it("subscribes to morpho://events through the global bridge", async () => {
    const unlisten = vi.fn();
    let registered: ((event: { payload: unknown }) => void) | undefined;
    const listen = vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      registered = handler;
      return unlisten;
    });
    installFakeTauri({ invoke: vi.fn(async (): Promise<unknown> => okEnvelope([])), listen });

    const handler = vi.fn();
    const unsubscribe = await listenResearchEvents(handler);

    expect(listen).toHaveBeenCalledWith(MORPHO_EVENTS_CHANNEL, expect.any(Function));
    registered?.({ payload: researchEvent });
    expect(handler).toHaveBeenCalledWith(researchEvent);
    // A payload drifting from research.event.v1 is dropped, never thrown.
    registered?.({ payload: { schema: 1 } });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("resolves to a no-op unlisten outside the desktop window", async () => {
    delete window.__TAURI__;
    const handler = vi.fn();
    const unsubscribe = await listenResearchEvents(handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
