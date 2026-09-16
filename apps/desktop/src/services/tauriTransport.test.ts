import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockBackend } from "./mocks/backend";
import { MorphoError } from "./errors";
import type { ResearchConfig } from "@/types/domain";
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

/* IPC batch 2 wire fixtures (serde JSON of src-tauri/src/projections.rs). */

const SECTION_ID = "7f000000-0000-7000-8000-000000000007";
const CLAIM_ID = "7f000000-0000-7000-8000-000000000008";
const SOURCE_ID = "7f000000-0000-7000-8000-000000000009";

const researchConfigView = {
  schema_version: "1.0",
  config_id: CONFIG_ID,
  project_id: PROJECT_ID,
  domain: "AI",
  topic: "LLM interpretability",
  purpose: "research",
  audience: "researchers",
  depth: 4,
  dimensions: ["theory", "safety"],
  // time_range is ALWAYS an object, never bare null (frontend zod contract).
  time_range: { from: "2023-01-01T00:00:00.000Z", to: null },
  geographic_scope: "global",
  languages: ["en", "zh"],
  source_types: ["paper", "web"],
  source_domains: ["arxiv.org"],
  update_frequency: "manual",
  created_at: "2024-01-02T03:04:05.000Z",
  updated_at: "2024-01-02T03:04:05.000Z",
};

const planView = {
  id: PLAN_ID,
  project_id: PROJECT_ID,
  title: "LLM interpretability 研究计划",
  status: "draft",
  rationale: "cover the configured dimensions",
  sections: [
    {
      id: SECTION_ID,
      title: "theory 维度",
      dimension: "theory",
      rationale: "why this section exists",
      objectives: ["collect sources"],
      tasks: [
        {
          id: TASK_ID,
          title: "检索 theory 维度核心来源",
          description: "search instructions",
          kind: "search",
        },
      ],
    },
  ],
  created_at: "2024-01-02T03:04:05.000Z",
  updated_at: "2024-01-02T03:04:06.000Z",
};

/** `run_latest_get` payload (ADR-024): persisted run + rollup + frozen config. */
const runLatestView = {
  run: {
    id: RUN_ID,
    project_id: PROJECT_ID,
    plan_id: PLAN_ID,
    status: "needs_review",
    worker_job_id: JOB_ID,
    started_at: 1700000000000,
    finished_at: null,
    created_at: 1700000000000,
    updated_at: 1700000000500,
  },
  task_rollup: {
    run_id: RUN_ID,
    run_status: "needs_review",
    task_counts: { RUNNING: 1 },
    tasks: [{ task_id: TASK_ID, status: "RUNNING" }],
  },
  plan_title: "T",
  config_snapshot: researchConfigView,
};

const evidenceViews = [
  {
    id: "7f000000-0000-7000-8000-00000000000a",
    project_id: PROJECT_ID,
    claim_id: CLAIM_ID,
    source_id: SOURCE_ID,
    quote: "uses attention",
    locator: { kind: "page", value: "p. 2" },
    retrieved_at: "2024-01-02T03:04:05.000Z",
    direction: "support",
    extraction_method: "llm_extraction",
    created_at: "2024-01-02T03:04:05.000Z",
  },
  {
    id: "7f000000-0000-7000-8000-00000000000b",
    project_id: PROJECT_ID,
    claim_id: CLAIM_ID,
    source_id: SOURCE_ID,
    quote: "no locator stored",
    locator: { kind: "quote", value: "no locator stored" },
    retrieved_at: "2024-01-02T03:04:05.000Z",
    direction: "contradict",
    extraction_method: "llm_extraction",
    created_at: "2024-01-02T03:04:05.000Z",
  },
];

const graphProjection = {
  project_id: PROJECT_ID,
  nodes: [
    {
      id: "7f000000-0000-7000-8000-00000000000c",
      type: "Concept",
      title: "Transformer",
      confidence: "high",
      dimension: "theory",
      source_count: 3,
      claim_count: 2,
      year: null,
    },
  ],
  relations: [
    {
      id: "7f000000-0000-7000-8000-00000000000d",
      source_node_id: "7f000000-0000-7000-8000-00000000000c",
      target_node_id: "7f000000-0000-7000-8000-00000000000e",
      predicate: "derives_from",
      confidence: 0.8,
    },
  ],
};

const approvedGapReport = {
  project_id: PROJECT_ID,
  gaps: [
    {
      id: `gap:${PROJECT_ID}:theory`,
      project_id: PROJECT_ID,
      dimension: "theory",
      trigger: "coverage_below_threshold",
      rule: "coverage < 0.6",
      detail: "维度 theory 覆盖不足。",
      quality_sources_found: 0,
      coverage: 0.12,
      proposed_task: {
        title: "Follow-up research: theory",
        description: "target coverage >= 0.6",
        dimension: "theory",
      },
      proposal_status: "approved",
      created_task_id: TASK_ID,
    },
  ],
  computed_at: "2024-01-02T03:04:05.000Z",
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

  it("maps run.start onto plan_list + run_start and serves the persisted view", async () => {
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "plan_list") return okEnvelope([planWithTasks]);
      if (command === "run_start") return okEnvelope(runStarted);
      if (command === "run_latest_get") return okEnvelope(runLatestView);
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
    // The response is the persisted read, not an optimistic snapshot.
    expect(invoke).toHaveBeenNthCalledWith(3, "run_latest_get", {
      request: {
        schema_version: "1.0",
        request_id: expect.any(String),
        data: { project_id: PROJECT_ID },
      },
    });
    expect(run).toMatchObject({
      id: RUN_ID,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
      state: "NEEDS_REVIEW",
      plan_snapshot_title: "T",
      // The frozen config snapshot (the generation the plan was built from).
      config_snapshot: { topic: "LLM interpretability", depth: 4 },
    });
  });

  it("run.get reads null without a run and serves the persisted view after run.start", async () => {
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "run_latest_get") return okEnvelope(runLatestView);
      if (command === "plan_list") return okEnvelope([planWithTasks]);
      if (command === "run_start") return okEnvelope(runStarted);
      throw new Error(`unexpected rust command '${command}'`);
    });
    const transport = createTauriTransport({ invoke });

    // No persisted run → null (the read itself is persisted-state driven).
    const noRunInvoke = vi.fn(async (): Promise<unknown> => okEnvelope(null));
    await expect(
      createTauriTransport({ invoke: noRunInvoke }).invoke("run.get", {
        project_id: PROJECT_ID,
      }),
    ).resolves.toBeNull();

    await transport.invoke("run.start", { project_id: PROJECT_ID });
    const run = await transport.invoke("run.get", { project_id: PROJECT_ID });

    expect(invoke).toHaveBeenLastCalledWith(
      "run_latest_get",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    // The persisted rollup (needs_review) is the authority.
    expect(run).toMatchObject({
      id: RUN_ID,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
      state: "NEEDS_REVIEW",
      plan_snapshot_title: "T",
      started_at: "2023-11-14T22:13:20.000Z",
      config_snapshot: { topic: "LLM interpretability", depth: 4 },
    });
  });

  it("run.cancel resolves the job through the persisted run binding", async () => {
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "run_latest_get") return okEnvelope(runLatestView);
      if (command === "run_cancel") return okEnvelope(true);
      throw new Error(`unexpected rust command '${command}'`);
    });
    const transport = createTauriTransport({ invoke });

    // No run at all → typed NOT_FOUND.
    const noRun = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "run_latest_get") return okEnvelope(null);
      throw new Error(`unexpected rust command '${command}'`);
    });
    await expect(
      createTauriTransport({ invoke: noRun }).invoke("run.cancel", {
        project_id: PROJECT_ID,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      transport.invoke("run.cancel", { project_id: PROJECT_ID }),
    ).resolves.toBe(true);
    expect(invoke).toHaveBeenLastCalledWith(
      "run_cancel",
      expect.objectContaining({
        request: expect.objectContaining({ data: { job_id: JOB_ID } }),
      }),
    );
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

  it("maps gap.list onto gap_report_get with the persisted decisions", async () => {
    const pendingReport = {
      project_id: PROJECT_ID,
      gaps: [
        {
          id: `gap:${PROJECT_ID}:theory`,
          project_id: PROJECT_ID,
          dimension: "theory",
          trigger: "coverage_below_threshold",
          rule: "coverage < 0.6",
          detail: "维度 theory 覆盖不足。",
          quality_sources_found: 0,
          coverage: 0.12,
          proposed_task: {
            title: "Follow-up research: theory",
            description: "target coverage >= 0.6",
            dimension: "theory",
          },
          proposal_status: "pending_approval",
          created_task_id: null,
        },
      ],
      computed_at: "2024-01-02T03:04:05.000Z",
    };
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(pendingReport));
    const report = await createTauriTransport({ invoke }).invoke("gap.list", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "gap_report_get",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
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

  it("maps secrets.setProviderKey onto secrets_set_provider_key and returns only the reference", async () => {
    // Fake key material built at runtime; never a literal credential.
    const fakeKey = Array.from({ length: 16 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope({ provider: "glm", key_name: "api_key" }),
    );
    const reference = await createTauriTransport({ invoke }).invoke(
      "secrets.setProviderKey",
      { provider: "glm", api_key: fakeKey },
    );

    expect(invoke).toHaveBeenCalledWith(
      "secrets_set_provider_key",
      expect.objectContaining({
        request: expect.objectContaining({ data: { provider: "glm", api_key: fakeKey } }),
      }),
    );
    expect(reference).toEqual({ provider: "glm", key_name: "api_key" });
  });

  it("maps secrets.listProviders onto secrets_list_providers", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope([
        {
          name: "glm",
          base_url: "https://api.example.invalid/v4",
          model: "m-test",
          key_ref: { provider: "glm", key_name: "api_key" },
          has_key: true,
        },
      ]),
    );
    const providers = await createTauriTransport({ invoke }).invoke(
      "secrets.listProviders",
      {},
    );

    expect(invoke).toHaveBeenCalledWith(
      "secrets_list_providers",
      expect.objectContaining({ request: expect.objectContaining({ data: {} }) }),
    );
    expect(providers).toEqual([
      {
        name: "glm",
        base_url: "https://api.example.invalid/v4",
        model: "m-test",
        key_ref: { provider: "glm", key_name: "api_key" },
        has_key: true,
      },
    ]);
  });

  it("maps vault.exportProject onto vault_export_project, projecting merge proposals", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope({
        written: 3,
        unchanged: 2,
        conflicts: 1,
        skipped: 0,
        sources: 2,
        claims: 1,
        maps: 1,
        merge_proposals: [
          {
            path: "vault/p/Concepts/x.md",
            node_id: "node-1",
            ours: "# generated content",
            theirs_hash: "sha256:abc",
            reason: "user edit on disk",
          },
        ],
        vault_root: "C:/vault/p",
      }),
    );
    const summary = await createTauriTransport({ invoke }).invoke(
      "vault.exportProject",
      { project_id: PROJECT_ID },
    );

    expect(invoke).toHaveBeenCalledWith(
      "vault_export_project",
      expect.objectContaining({ request: expect.objectContaining({ data: { project_id: PROJECT_ID } }) }),
    );
    expect(summary).toEqual({
      written: 3,
      unchanged: 2,
      conflicts: 1,
      skipped: 0,
      sources: 2,
      claims: 1,
      maps: 1,
      merge_proposals: [{ path: "vault/p/Concepts/x.md", node_id: "node-1", reason: "user edit on disk" }],
      vault_root: "C:/vault/p",
    });
    // File content must not ride along into the UI payload.
    expect(JSON.stringify(summary)).not.toContain("generated content");
  });

  it("maps project.archive onto project_archive with a null passthrough", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(null));
    expect(
      await createTauriTransport({ invoke }).invoke("project.archive", {
        project_id: PROJECT_ID,
      }),
    ).toBeNull();

    const invokeRecord = vi.fn(async (): Promise<unknown> => okEnvelope(projectRecord));
    const archived = await createTauriTransport({ invoke: invokeRecord }).invoke(
      "project.archive",
      { project_id: PROJECT_ID },
    );
    expect(invokeRecord).toHaveBeenCalledWith(
      "project_archive",
      expect.objectContaining({ request: expect.objectContaining({ data: { project_id: PROJECT_ID } }) }),
    );
    expect(archived).toEqual({
      id: PROJECT_ID,
      name: "BCI",
      description: "notes",
      created_at: "2023-11-14T22:13:20.000Z",
      updated_at: "2023-11-14T22:13:20.500Z",
    });
  });

  it("maps core.info and core.ping onto core_info/ping", async () => {
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "core_info") {
        return okEnvelope({
          app_name: "Morpho Research OS",
          app_version: "0.0.1",
          ipc_schema_version: "1.0",
          event_envelope: "research.event.v1",
          worker_protocol_version: "1.0",
          database_schema_version: 2,
        });
      }
      if (command === "ping") return okEnvelope({ echo: "status" });
      throw new Error(`unexpected rust command '${command}'`);
    });
    const transport = createTauriTransport({ invoke });

    const info = await transport.invoke("core.info", {});
    expect(info.app_name).toBe("Morpho Research OS");
    expect(info.database_schema_version).toBe(2);

    const pong = await transport.invoke("core.ping", { echo: "status" });
    expect(pong).toEqual({ echo: "status" });
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "ping",
      expect.objectContaining({ request: expect.objectContaining({ data: { echo: "status" } }) }),
    );
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
      createTauriTransport({ invoke }).invoke("task.pause", {
        project_id: PROJECT_ID,
        task_id: TASK_ID,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", correlationId: "local-unsupported" });
    expect(invoke).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* IPC batch 2 (ADR-020): research config, plan review, evidence,      */
/* graph, gap proposals                                                */
/* ------------------------------------------------------------------ */

describe("tauri transport batch-2 command mapping", () => {
  it("maps config.get onto research_config_get with the object time_range", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(researchConfigView));
    const config = await createTauriTransport({ invoke }).invoke("config.get", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "research_config_get",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(config).toMatchObject({
      schema_version: "1.0",
      domain: "AI",
      topic: "LLM interpretability",
      purpose: "research",
      depth: 4,
      dimensions: ["theory", "safety"],
      time_range: { from: "2023-01-01T00:00:00.000Z", to: null },
      languages: ["en", "zh"],
      update_frequency: "manual",
    });
    // Bookkeeping fields of the persisted record stay out of the payload.
    expect(JSON.stringify(config)).not.toContain(CONFIG_ID);
  });

  it("maps config.update onto research_config_put, forwarding the config object", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope({ ...researchConfigView, topic: "LLM safety", config_id: "7f000000-0000-7000-8000-00000000000f" }),
    );
    const config = await createTauriTransport({ invoke }).invoke("config.update", {
      project_id: PROJECT_ID,
      config: researchConfigView as unknown as ResearchConfig,
    });

    expect(invoke).toHaveBeenCalledWith(
      "research_config_put",
      expect.objectContaining({
        request: expect.objectContaining({
          data: { project_id: PROJECT_ID, config: researchConfigView },
        }),
      }),
    );
    // The response is the NEW generation the core resolved.
    expect(config).toMatchObject({ topic: "LLM safety" });
  });

  it("maps plan.regenerate onto plan_regenerate and caches the sectioned view", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(planView));
    const transport = createTauriTransport({ invoke });

    const plan = await transport.invoke("plan.regenerate", { project_id: PROJECT_ID });
    expect(invoke).toHaveBeenCalledWith(
      "plan_regenerate",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(plan).toMatchObject({
      id: PLAN_ID,
      status: "draft",
      rationale: "cover the configured dimensions",
    });
    expect(plan.sections[0]).toMatchObject({
      dimension: "theory",
      objectives: ["collect sources"],
    });
    expect(plan.sections[0].tasks[0]).toMatchObject({
      id: TASK_ID,
      kind: "search",
    });
  });

  it("maps plan.updateTask onto plan_update_task with the full request shape", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope({
        ...planView,
        sections: [
          {
            ...planView.sections[0],
            tasks: [
              { ...planView.sections[0].tasks[0], title: "聚焦的检索任务", description: "更聚焦" },
            ],
          },
        ],
      }),
    );
    const plan = await createTauriTransport({ invoke }).invoke("plan.updateTask", {
      project_id: PROJECT_ID,
      task_id: TASK_ID,
      title: "聚焦的检索任务",
      description: "更聚焦",
    });

    expect(invoke).toHaveBeenCalledWith(
      "plan_update_task",
      expect.objectContaining({
        request: expect.objectContaining({
          data: {
            project_id: PROJECT_ID,
            task_id: TASK_ID,
            title: "聚焦的检索任务",
            description: "更聚焦",
          },
        }),
      }),
    );
    expect(plan.sections[0].tasks[0]).toMatchObject({
      title: "聚焦的检索任务",
      description: "更聚焦",
    });
  });

  it("maps plan.reject onto plan_reject", async () => {
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope({ ...planView, status: "rejected" }),
    );
    const plan = await createTauriTransport({ invoke }).invoke("plan.reject", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "plan_reject",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(plan).toMatchObject({ id: PLAN_ID, status: "rejected" });
  });

  it("serves plan.get from the persisted plan_latest_view projection", async () => {
    let view: typeof planView & { status: string } = { ...planView, status: "draft" };
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "plan_list") return okEnvelope([planWithTasks]);
      if (command === "plan_latest_view") return okEnvelope(view);
      if (command === "plan_approve") {
        view = { ...view, status: "approved", updated_at: "2023-11-14T22:13:20.900Z" };
        return okEnvelope({ ...planWithTasks.plan, status: "approved" });
      }
      throw new Error(`unexpected rust command '${command}'`);
    });
    const transport = createTauriTransport({ invoke });

    // The sectioned tree always comes from the persisted projection — no
    // session cache, so a reload reads the same shape.
    const first = await transport.invoke("plan.get", { project_id: PROJECT_ID });
    expect(invoke).toHaveBeenCalledWith(
      "plan_latest_view",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(first).toMatchObject({ id: PLAN_ID, status: "draft" });
    expect(first?.sections).toHaveLength(1);
    expect(first?.sections[0].tasks[0].id).toBe(TASK_ID);

    // plan.approve re-reads the projection, so the refreshed status and the
    // full tree land together.
    const approved = await transport.invoke("plan.approve", { project_id: PROJECT_ID });
    expect(approved).toMatchObject({ id: PLAN_ID, status: "approved" });
    expect(approved.sections).toHaveLength(1);
    const refetched = await transport.invoke("plan.get", { project_id: PROJECT_ID });
    expect(refetched).toMatchObject({ status: "approved", updated_at: "2023-11-14T22:13:20.900Z" });
    expect(refetched?.sections).toHaveLength(1);
  });

  it("counts task.list on the latest plan generation only", async () => {
    const supersededEntry = {
      plan: {
        ...planWithTasks.plan,
        id: "7f000000-0000-7000-8000-000000000011",
        status: "superseded",
        created_at: 1600000000000,
        updated_at: 1600000000500,
      },
      tasks: [
        { ...planWithTasks.tasks[0], id: "7f000000-0000-7000-8000-000000000012" },
      ],
    };
    const invoke = vi.fn(async (): Promise<unknown> =>
      okEnvelope([supersededEntry, planWithTasks]),
    );
    const tasks = await createTauriTransport({ invoke }).invoke("task.list", {
      project_id: PROJECT_ID,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: TASK_ID, project_id: PROJECT_ID });
  });

  it("maps evidence.listByClaim onto evidence_list_by_claim with locator kinds", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(evidenceViews));
    const evidence = await createTauriTransport({ invoke }).invoke("evidence.listByClaim", {
      project_id: PROJECT_ID,
      claim_id: CLAIM_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "evidence_list_by_claim",
      expect.objectContaining({
        request: expect.objectContaining({
          data: { project_id: PROJECT_ID, claim_id: CLAIM_ID },
        }),
      }),
    );
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      claim_id: CLAIM_ID,
      locator: { kind: "page", value: "p. 2" },
      direction: "support",
      extraction_method: "llm_extraction",
    });
    expect(evidence[1]).toMatchObject({
      locator: { kind: "quote" },
      direction: "contradict",
    });
  });

  it("maps graph.get onto graph_get, keeping the `type` node key", async () => {
    const invoke = vi.fn(async (): Promise<unknown> => okEnvelope(graphProjection));
    const graph = await createTauriTransport({ invoke }).invoke("graph.get", {
      project_id: PROJECT_ID,
    });

    expect(invoke).toHaveBeenCalledWith(
      "graph_get",
      expect.objectContaining({
        request: expect.objectContaining({ data: { project_id: PROJECT_ID } }),
      }),
    );
    expect(graph.project_id).toBe(PROJECT_ID);
    expect(graph.nodes[0]).toMatchObject({
      type: "Concept",
      confidence: "high",
      dimension: "theory",
      source_count: 3,
      claim_count: 2,
      year: null,
    });
    expect(graph.relations[0]).toMatchObject({
      predicate: "derives_from",
      confidence: 0.8,
    });
  });

  it("maps gap.approveProposal/dismissProposal onto the persisted-decision report", async () => {
    let currentReport = {
      project_id: PROJECT_ID,
      gaps: [
        {
          id: `gap:${PROJECT_ID}:theory`,
          project_id: PROJECT_ID,
          dimension: "theory",
          trigger: "coverage_below_threshold",
          rule: "coverage < 0.6",
          detail: "维度 theory 覆盖不足。",
          quality_sources_found: 0,
          coverage: 0.12,
          proposed_task: {
            title: "Follow-up research: theory",
            description: "target coverage >= 0.6",
            dimension: "theory",
          },
          proposal_status: "pending_approval" as string,
          created_task_id: null as string | null,
        },
      ],
      computed_at: "2024-01-02T03:04:05.000Z",
    };
    const invoke = vi.fn(async (command: string): Promise<unknown> => {
      if (command === "gap_report_get") return okEnvelope(currentReport);
      if (command === "gap_approve_proposal") {
        currentReport = approvedGapReport;
        return okEnvelope(currentReport);
      }
      if (command === "gap_dismiss_proposal") {
        currentReport = { ...approvedGapReport, gaps: [] };
        return okEnvelope(currentReport);
      }
      throw new Error(`unexpected rust command '${command}'`);
    });
    const transport = createTauriTransport({ invoke });

    const approved = await transport.invoke("gap.approveProposal", {
      project_id: PROJECT_ID,
      gap_id: `gap:${PROJECT_ID}:theory`,
    });
    expect(invoke).toHaveBeenCalledWith(
      "gap_approve_proposal",
      expect.objectContaining({
        request: expect.objectContaining({
          data: { project_id: PROJECT_ID, gap_id: `gap:${PROJECT_ID}:theory` },
        }),
      }),
    );
    expect(approved.gaps[0]).toMatchObject({
      proposal_status: "approved",
      created_task_id: TASK_ID,
    });

    // The decision sticks on the next gap.list read — through the persisted
    // report, not a session map.
    const afterApprove = await transport.invoke("gap.list", { project_id: PROJECT_ID });
    expect(afterApprove.gaps[0]).toMatchObject({
      id: `gap:${PROJECT_ID}:theory`,
      proposal_status: "approved",
      created_task_id: TASK_ID,
    });

    await transport.invoke("gap.dismissProposal", {
      project_id: PROJECT_ID,
      gap_id: `gap:${PROJECT_ID}:theory`,
    });
    expect(invoke).toHaveBeenLastCalledWith(
      "gap_dismiss_proposal",
      expect.objectContaining({
        request: expect.objectContaining({
          data: { project_id: PROJECT_ID, gap_id: `gap:${PROJECT_ID}:theory` },
        }),
      }),
    );
    const afterDismiss = await transport.invoke("gap.list", { project_id: PROJECT_ID });
    expect(afterDismiss.gaps).toEqual([]);
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
