//! Typed Tauri command adapters.
//!
//! Every command returns the [`IpcResponse`] envelope from `docs/API.md` and
//! reports failures through the unified [`CoreError`] model. This module must
//! stay a thin adapter: business behavior lives in the service/repository
//! layers, never here. Each `#[tauri::command]` fn delegates to a private
//! `*_impl` function on [`AppState`] so the logic is unit-testable with an
//! in-memory database and the fake worker transport (no Tauri app needed).

use crate::coverage::CoverageReport;
use crate::error::{CoreError, ErrorCode as CoreErrorCode};
use crate::ipc::{IpcRequest, IpcResponse};
use crate::repositories::claims::ClaimRecord;
use crate::repositories::configs::{NewResearchConfig, ResearchConfigRecord, ResearchConfigs};
use crate::repositories::events::EventRecord;
use crate::repositories::knowledge::KnowledgeNodeRecord;
use crate::repositories::plans::{PlanRecord, TaskRecord};
use crate::repositories::projects::ProjectRecord;
use crate::repositories::relations::RelationRecord;
use crate::repositories::runs::RunRecord;
use crate::repositories::services::{
    GapService, PlanService, ProjectService, VaultExportResult, VaultService,
};
use crate::repositories::sources::SourceRecord;
use crate::secrets::{AppConfig, FileConfigStore, SecretRef, WorkerConfig};
use crate::state::AppState;
use crate::versions::{
    APP_NAME, APP_VERSION, EVENT_ENVELOPE, IPC_SCHEMA_VERSION, WORKER_PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Static capability information served over IPC. Lets the frontend verify
/// envelope/protocol compatibility without touching any backend internals.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoreInfo {
    pub app_name: String,
    pub app_version: String,
    pub ipc_schema_version: String,
    pub event_envelope: String,
    pub worker_protocol_version: String,
    /// The SQLite schema version this core migrates to.
    pub database_schema_version: i64,
}

/// Wraps an impl result in the IPC response envelope.
fn wrapped<T>(request_id: &str, result: Result<T, CoreError>) -> IpcResponse<T> {
    match result {
        Ok(data) => IpcResponse::ok(request_id.to_string(), data),
        Err(error) => IpcResponse::err(request_id.to_string(), error),
    }
}

#[tauri::command]
pub fn core_info() -> IpcResponse<CoreInfo> {
    IpcResponse::ok(
        uuid::Uuid::now_v7().to_string(),
        CoreInfo {
            app_name: APP_NAME.to_string(),
            app_version: APP_VERSION.to_string(),
            ipc_schema_version: IPC_SCHEMA_VERSION.to_string(),
            event_envelope: EVENT_ENVELOPE.to_string(),
            worker_protocol_version: WORKER_PROTOCOL_VERSION.to_string(),
            database_schema_version: crate::db::LATEST_SCHEMA_VERSION,
        },
    )
}

/// Round-trip echo command demonstrating the request/response envelope.
/// Schema-version negotiation is a W2-05 contract concern; see
/// [`IpcRequest::matches_schema_version`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PingRequest {
    pub echo: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pong {
    pub echo: String,
}

#[tauri::command]
pub fn ping(request: IpcRequest<PingRequest>) -> IpcResponse<Pong> {
    IpcResponse::ok(
        request.request_id.clone(),
        Pong {
            echo: request.data.echo,
        },
    )
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProjectListRequest {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProjectGetRequest {
    pub project_id: String,
}

/// Research configuration as it crosses IPC on project creation. Mirrors
/// `NewResearchConfig` with IPC-friendly defaults.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConfigInput {
    pub domain: String,
    pub topic: String,
    #[serde(default = "default_purpose")]
    pub purpose: String,
    #[serde(default)]
    pub audience: String,
    #[serde(default = "default_depth")]
    pub depth: i64,
    #[serde(default)]
    pub dimensions: Vec<String>,
    #[serde(default)]
    pub time_range_from: Option<i64>,
    #[serde(default)]
    pub time_range_to: Option<i64>,
    #[serde(default)]
    pub geographic_scope: String,
    #[serde(default = "default_languages")]
    pub languages: Vec<String>,
    #[serde(default)]
    pub source_types: Vec<String>,
    #[serde(default)]
    pub source_domains: Vec<String>,
    #[serde(default = "default_update_frequency")]
    pub update_frequency: String,
}

fn default_purpose() -> String {
    "learning".into()
}

fn default_depth() -> i64 {
    2
}

fn default_languages() -> Vec<String> {
    vec!["en".into()]
}

fn default_update_frequency() -> String {
    "manual".into()
}

impl From<ConfigInput> for NewResearchConfig {
    fn from(input: ConfigInput) -> Self {
        Self {
            project_id: String::new(),
            domain: input.domain,
            topic: input.topic,
            purpose: input.purpose,
            audience: input.audience,
            depth: input.depth,
            dimensions: input.dimensions,
            time_range_from: input.time_range_from,
            time_range_to: input.time_range_to,
            geographic_scope: input.geographic_scope,
            languages: input.languages,
            source_types: input.source_types,
            source_domains: input.source_domains,
            update_frequency: input.update_frequency,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectCreateRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// The project's first research configuration; defaults apply when
    /// omitted (domain/topic default to empty strings).
    #[serde(default = "default_config_input")]
    pub config: ConfigInput,
}

fn default_config_input() -> ConfigInput {
    ConfigInput {
        domain: String::new(),
        topic: String::new(),
        purpose: default_purpose(),
        audience: String::new(),
        depth: default_depth(),
        dimensions: Vec::new(),
        time_range_from: None,
        time_range_to: None,
        geographic_scope: String::new(),
        languages: default_languages(),
        source_types: Vec::new(),
        source_domains: Vec::new(),
        update_frequency: default_update_frequency(),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectCreated {
    pub project: ProjectRecord,
    pub config: ResearchConfigRecord,
}

#[tauri::command]
pub fn project_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectListRequest>,
) -> IpcResponse<Vec<ProjectRecord>> {
    wrapped(&request.request_id, project_list_impl(&state))
}

fn project_list_impl(state: &AppState) -> Result<Vec<ProjectRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::projects::Projects::list(&conn)
}

#[tauri::command]
pub fn project_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectGetRequest>,
) -> IpcResponse<Option<ProjectRecord>> {
    wrapped(
        &request.request_id,
        project_get_impl(&state, &request.data.project_id),
    )
}

fn project_get_impl(
    state: &AppState,
    project_id: &str,
) -> Result<Option<ProjectRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::projects::Projects::get(&conn, project_id)
}

#[tauri::command]
pub fn project_create(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectCreateRequest>,
) -> IpcResponse<ProjectCreated> {
    wrapped(
        &request.request_id,
        project_create_impl(&state, request.data),
    )
}

fn project_create_impl(
    state: &AppState,
    request: ProjectCreateRequest,
) -> Result<ProjectCreated, CoreError> {
    if request.name.trim().is_empty() {
        return Err(CoreError::database("project name must not be empty"));
    }
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    let (project, config) = ProjectService::create_project_with_config(
        &mut conn,
        crate::repositories::projects::NewProject {
            name: request.name.trim().to_string(),
            description: request.description,
        },
        request.config.into(),
    )?;
    Ok(ProjectCreated { project, config })
}

#[tauri::command]
pub fn project_archive(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectGetRequest>,
) -> IpcResponse<Option<ProjectRecord>> {
    wrapped(
        &request.request_id,
        project_archive_impl(&state, &request.data.project_id),
    )
}

fn project_archive_impl(
    state: &AppState,
    project_id: &str,
) -> Result<Option<ProjectRecord>, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::projects::Projects::get(&conn, project_id)?.is_none() {
        return Ok(None);
    }
    crate::repositories::with_write_tx(&mut conn, |tx| {
        crate::repositories::projects::Projects::update_status(tx, project_id, "archived")
    })
    .map(Some)
}

// ---------------------------------------------------------------------------
// App configuration (references only; never secret values)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ConfigGetRequest {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConfigPutRequest {
    pub config: AppConfig,
}

#[tauri::command]
pub fn config_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ConfigGetRequest>,
) -> IpcResponse<AppConfig> {
    wrapped(&request.request_id, config_get_impl(&state))
}

fn config_get_impl(state: &AppState) -> Result<AppConfig, CoreError> {
    FileConfigStore::new(&state.config_path).load()
}

#[tauri::command]
pub fn config_put(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ConfigPutRequest>,
) -> IpcResponse<AppConfig> {
    wrapped(
        &request.request_id,
        config_put_impl(&state, request.data.config),
    )
}

fn config_put_impl(state: &AppState, config: AppConfig) -> Result<AppConfig, CoreError> {
    config.worker.validate()?;
    config.secrets.validate()?;
    let store = FileConfigStore::new(&state.config_path);
    store.save(&config)?;
    store.load()
}

// ---------------------------------------------------------------------------
// Project research configuration (IPC batch 2, ADR-020)
//
// Distinct from `config_get`/`config_put` above, which transport the APP
// config (worker/secrets wiring, secrets.rs): these commands read and write
// the PROJECT-scoped research configuration persisted in
// `research_configs` (research-config.v1.json). The frontend's
// `config.get`/`config.update` CommandMap entries target these.
// ---------------------------------------------------------------------------

/// Purposes allowed by research-config.v1.json (frontend
/// `researchPurposeSchema`).
pub const RESEARCH_PURPOSES: [&str; 8] = [
    "learning", "teaching", "writing", "research", "industry", "product", "strategy", "custom",
];

/// The research config as it crosses IPC on update. Mirrors the frontend
/// `ResearchConfig` object (ISO-8601 time bounds); unknown keys such as
/// `schema_version` are ignored by serde and re-stamped on the response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchConfigInput {
    pub domain: String,
    pub topic: String,
    pub purpose: String,
    #[serde(default)]
    pub audience: String,
    pub depth: i64,
    pub dimensions: Vec<String>,
    #[serde(default)]
    pub time_range: TimeRangeInput,
    #[serde(default)]
    pub geographic_scope: String,
    pub languages: Vec<String>,
    pub source_types: Vec<String>,
    #[serde(default)]
    pub source_domains: Vec<String>,
    pub update_frequency: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TimeRangeInput {
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchConfigPutRequest {
    pub project_id: String,
    pub config: ResearchConfigInput,
}

/// Returns the project's current (latest) research configuration in the
/// frontend `ResearchConfig` shape.
#[tauri::command]
pub fn research_config_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<crate::projections::ResearchConfigView> {
    wrapped(
        &request.request_id,
        research_config_get_impl(&state, &request.data.project_id),
    )
}

fn research_config_get_impl(
    state: &AppState,
    project_id: &str,
) -> Result<crate::projections::ResearchConfigView, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::projects::Projects::get(&conn, project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{project_id}' not found"
        )));
    }
    let record = ResearchConfigs::list_for_project(&conn, project_id)?
        .into_iter()
        .next_back()
        .ok_or_else(|| {
            CoreError::database(format!(
                "project '{project_id}' has no research configuration"
            ))
        })?;
    Ok(crate::projections::research_config_view(&record))
}

/// Saves an updated research configuration for the project. The write is a
/// new `research_configs` generation, not an in-place edit: earlier plan
/// generations keep referencing the exact configuration they were built
/// from (`plans.research_config_id`), while later reads and regenerated
/// plans resolve the new generation (ADR-020).
#[tauri::command]
pub fn research_config_put(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ResearchConfigPutRequest>,
) -> IpcResponse<crate::projections::ResearchConfigView> {
    wrapped(
        &request.request_id,
        research_config_put_impl(&state, request.data),
    )
}

fn research_config_put_impl(
    state: &AppState,
    request: ResearchConfigPutRequest,
) -> Result<crate::projections::ResearchConfigView, CoreError> {
    let new_config = validated_research_config(&request.project_id, &request.config)?;
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::projects::Projects::get(&conn, &request.project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{}' not found",
            request.project_id
        )));
    }
    let record = crate::repositories::with_write_tx(&mut conn, |tx| {
        ResearchConfigs::insert(tx, &new_config)
    })?;
    Ok(crate::projections::research_config_view(&record))
}

/// Applies the research-config.v1.json value constraints the frontend
/// schema also enforces (`researchPurposeSchema`, `researchDepthSchema`,
/// the `update_frequency` literal, ISO-8601 bounds) and converts time
/// bounds to persisted unix milliseconds.
fn validated_research_config(
    project_id: &str,
    input: &ResearchConfigInput,
) -> Result<NewResearchConfig, CoreError> {
    if !RESEARCH_PURPOSES.contains(&input.purpose.as_str()) {
        return Err(CoreError::database(format!(
            "unknown research purpose '{}' (expected one of: {})",
            input.purpose,
            RESEARCH_PURPOSES.join(", ")
        )));
    }
    if !(1..=5).contains(&input.depth) {
        return Err(CoreError::database(format!(
            "research depth must be between 1 and 5 (got {})",
            input.depth
        )));
    }
    if input.update_frequency != "manual" {
        return Err(CoreError::database(format!(
            "update_frequency '{}' is not supported yet (V0.1 only allows 'manual')",
            input.update_frequency
        )));
    }
    let parse_bound = |value: &Option<String>| -> Result<Option<i64>, CoreError> {
        value
            .as_deref()
            .map(|raw| {
                crate::vault::parse_rfc3339_to_unix_ms(raw).ok_or_else(|| {
                    CoreError::database(format!(
                        "time_range bound '{raw}' is not an ISO-8601 date-time"
                    ))
                })
            })
            .transpose()
    };
    Ok(NewResearchConfig {
        project_id: project_id.to_string(),
        domain: input.domain.clone(),
        topic: input.topic.clone(),
        purpose: input.purpose.clone(),
        audience: input.audience.clone(),
        depth: input.depth,
        dimensions: input.dimensions.clone(),
        time_range_from: parse_bound(&input.time_range.from)?,
        time_range_to: parse_bound(&input.time_range.to)?,
        geographic_scope: input.geographic_scope.clone(),
        languages: input.languages.clone(),
        source_types: input.source_types.clone(),
        source_domains: input.source_domains.clone(),
        update_frequency: input.update_frequency.clone(),
    })
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PlanListRequest {
    pub project_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanWithTasks {
    pub plan: PlanRecord,
    pub tasks: Vec<TaskRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanApproveRequest {
    pub plan_id: String,
}

#[tauri::command]
pub fn plan_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<PlanListRequest>,
) -> IpcResponse<Vec<PlanWithTasks>> {
    wrapped(
        &request.request_id,
        plan_list_impl(&state, &request.data.project_id),
    )
}

fn plan_list_impl(state: &AppState, project_id: &str) -> Result<Vec<PlanWithTasks>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::plans::Plans::list_for_project(&conn, project_id)?
        .into_iter()
        .map(|plan| {
            let tasks = crate::repositories::plans::Plans::tasks_for_plan(&conn, &plan.id)?;
            Ok(PlanWithTasks { plan, tasks })
        })
        .collect()
}

#[tauri::command]
pub fn plan_approve(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<PlanApproveRequest>,
) -> IpcResponse<Option<PlanRecord>> {
    wrapped(
        &request.request_id,
        plan_approve_impl(&state, &request.data.plan_id),
    )
}

fn plan_approve_impl(state: &AppState, plan_id: &str) -> Result<Option<PlanRecord>, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::plans::Plans::get(&conn, plan_id)?.is_none() {
        return Ok(None);
    }
    crate::repositories::with_write_tx(&mut conn, |tx| {
        crate::repositories::plans::Plans::update_status(tx, plan_id, "approved")
    })
    .map(Some)
}

// ---------------------------------------------------------------------------
// Plan review actions (IPC batch 2, ADR-020)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PlanRegenerateRequest {
    pub project_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PlanRejectRequest {
    pub project_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanUpdateTaskRequest {
    pub project_id: String,
    pub task_id: String,
    pub title: String,
    pub description: String,
}

/// Regenerates the project's plan draft with the deterministic scripted V0.1
/// planner (the worker has no plan-regeneration job kind yet — that is a
/// protocol change and stays out of scope; see ADR-020). Earlier
/// generations move to `superseded`; the new draft comes back in the
/// frontend plan shape.
#[tauri::command]
pub fn plan_regenerate(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<PlanRegenerateRequest>,
) -> IpcResponse<crate::projections::PlanView> {
    wrapped(
        &request.request_id,
        plan_regenerate_impl(&state, &request.data.project_id),
    )
}

fn plan_regenerate_impl(
    state: &AppState,
    project_id: &str,
) -> Result<crate::projections::PlanView, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    let plan = PlanService::regenerate_plan(&mut conn, project_id)?;
    crate::projections::plan_view(&conn, &plan)
}

/// Edits one task of the project's current draft plan (title and
/// description; an empty title keeps the previous one). Editing closes once
/// the plan leaves `draft`, mirroring the mock's review flow.
#[tauri::command]
pub fn plan_update_task(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<PlanUpdateTaskRequest>,
) -> IpcResponse<crate::projections::PlanView> {
    wrapped(
        &request.request_id,
        plan_update_task_impl(&state, request.data),
    )
}

fn plan_update_task_impl(
    state: &AppState,
    request: PlanUpdateTaskRequest,
) -> Result<crate::projections::PlanView, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    let task = crate::repositories::tasks::Tasks::get(&conn, &request.task_id)?
        .ok_or_else(|| CoreError::database(format!("task '{}' not found", request.task_id)))?;
    let plan = crate::repositories::plans::Plans::get(&conn, &task.plan_id)?
        .ok_or_else(|| CoreError::database(format!("plan '{}' not found", task.plan_id)))?;
    if plan.project_id != request.project_id {
        return Err(CoreError::database(format!(
            "task '{}' does not belong to project '{}'",
            request.task_id, request.project_id
        )));
    }
    if plan.status != "draft" {
        return Err(CoreError::database(format!(
            "only draft plans can be edited (plan status is '{}')",
            plan.status
        )));
    }
    let trimmed = request.title.trim();
    let title = if trimmed.is_empty() {
        task.title.clone()
    } else {
        trimmed.to_string()
    };
    crate::repositories::with_write_tx(&mut conn, |tx| {
        crate::repositories::tasks::Tasks::set_title_and_description(
            tx,
            &task.id,
            &title,
            &request.description,
        )
        .map(|_| ())
    })?;
    crate::projections::plan_view(&conn, &plan)
}

/// Rejects the project's current (latest) plan generation.
#[tauri::command]
pub fn plan_reject(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<PlanRejectRequest>,
) -> IpcResponse<crate::projections::PlanView> {
    wrapped(
        &request.request_id,
        plan_reject_impl(&state, &request.data.project_id),
    )
}

fn plan_reject_impl(
    state: &AppState,
    project_id: &str,
) -> Result<crate::projections::PlanView, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    let plan = crate::repositories::plans::Plans::latest_for_project(&conn, project_id)?
        .ok_or_else(|| {
            CoreError::database(format!("project '{project_id}' has no plan to reject"))
        })?;
    let rejected = crate::repositories::with_write_tx(&mut conn, |tx| {
        crate::repositories::plans::Plans::update_status(tx, &plan.id, "rejected")
    })?;
    crate::projections::plan_view(&conn, &rejected)
}

// ---------------------------------------------------------------------------
// Runs (worker jobs)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunStartRequest {
    pub plan_id: String,
    /// The caller's plan-review decision carried into the job envelope.
    /// The core independently refuses to run plans whose persisted status is
    /// not `approved` (ADR-024), so this flag is defense in depth — the
    /// worker rejects the job without it (PLAN_NOT_APPROVED).
    #[serde(default)]
    pub approve_plan: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunStarted {
    pub project_id: String,
    /// Core-side run record id.
    pub run_id: String,
    /// The worker-acknowledged job id (use for run_get/run_cancel).
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RunGetRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RunCancelRequest {
    pub job_id: String,
}

#[tauri::command]
pub fn run_start(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<RunStartRequest>,
) -> IpcResponse<RunStarted> {
    wrapped(&request.request_id, run_start_impl(&state, request.data))
}

/// Public for the real-process smoke test (`tests/real_worker_smoke.rs`),
/// which drives the genuine command path against a real worker process.
pub fn run_start_impl(state: &AppState, request: RunStartRequest) -> Result<RunStarted, CoreError> {
    // Phase 1 (database): gate on the plan's persisted status, resolve its
    // config, build the approved task-tree payload, and create the run.
    let (run, config_value, plan_value) = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let plan = crate::repositories::plans::Plans::get(&conn, &request.plan_id)?
            .ok_or_else(|| CoreError::database(format!("plan '{}' not found", request.plan_id)))?;
        if plan.status != "approved" {
            return Err(CoreError::new(
                CoreErrorCode::DatabaseError,
                "只有已批准的研究计划可以启动运行。",
                format!(
                    "plan '{}' is '{}' — only approved plans can run (approve the plan first)",
                    plan.id, plan.status
                ),
                false,
            ));
        }
        // Idempotency rule (ADR-024): one non-terminal run per plan. A
        // completed/failed/cancelled run may be followed by a fresh run;
        // while a run is in flight, starting again is a structured error.
        for existing in crate::repositories::runs::Runs::list_for_project(&conn, &plan.project_id)?
        {
            if existing.plan_id == plan.id
                && matches!(
                    existing.status.as_str(),
                    "running" | "paused" | "needs_review"
                )
            {
                return Err(CoreError::new(
                    CoreErrorCode::DatabaseError,
                    "该计划已有进行中的运行，请先等待完成或取消后再启动。",
                    format!(
                        "plan '{}' already has an active run '{}' (status '{}')",
                        plan.id, existing.id, existing.status
                    ),
                    false,
                ));
            }
        }
        let config =
            crate::repositories::configs::ResearchConfigs::get(&conn, &plan.research_config_id)?
                .ok_or_else(|| {
                    CoreError::database(format!(
                        "research config '{}' not found",
                        plan.research_config_id
                    ))
                })?;
        let plan_value = approved_plan_wire(&conn, &plan, &config)?;
        let run = crate::repositories::with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::insert(
                tx,
                &crate::repositories::runs::NewRun {
                    id: None,
                    project_id: plan.project_id.clone(),
                    plan_id: plan.id.clone(),
                    started_at: None,
                },
            )
        })?;
        (run, research_config_wire(&config), plan_value)
    };

    // Phase 2 (worker): submit the research_run job carrying the APPROVED
    // task tree (core task ids travel verbatim; the worker neither re-plans
    // nor re-approves). Locks are taken sequentially, never nested.
    let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
    let ack = {
        let ack = supervisor.submit_job(&crate::worker::JobRequest {
            job_id: crate::ids::new_id(),
            run_id: run.id.clone(),
            task_id: None,
            kind: "research_run".into(),
            params: config_value,
            approve_plan: request.approve_plan,
            plan: Some(plan_value),
        });
        match ack {
            Ok(ack) => ack,
            // A failed submission must not leave a converged-looking RUNNING run
            // behind (audit F1): the run has no events, tasks, or job binding
            // yet, so removing it restores the pre-start state. If even that
            // fails, the run is closed as failed so the state stays honest.
            Err(err) => {
                let mut conn = state.conn.lock().expect("database mutex poisoned");
                let cleanup = crate::repositories::with_write_tx(&mut conn, |tx| {
                    tx.execute("DELETE FROM runs WHERE id = ?1", rusqlite::params![run.id])
                        .map(|_| ())
                        .map_err(CoreError::from)
                });
                if cleanup.is_err() {
                    let _ = crate::repositories::with_write_tx(&mut conn, |tx| {
                        crate::repositories::runs::Runs::update_status(tx, &run.id, "failed")
                            .map(|_| ())
                    });
                }
                return Err(err);
            }
        }
    };
    // Persist the job binding (migration 004) so run.get / run.cancel
    // survive a restart. A failure here must not strand an executing job
    // with no bound run: the run row is removed and the job cancelled.
    {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let bound = crate::repositories::with_write_tx(&mut conn, |tx| {
            crate::repositories::runs::Runs::set_worker_job(tx, &run.id, &ack.job_id)
        });
        if let Err(err) = bound {
            let _ = supervisor.cancel_job(&ack.job_id);
            let _ = crate::repositories::with_write_tx(&mut conn, |tx| {
                tx.execute("DELETE FROM runs WHERE id = ?1", rusqlite::params![run.id])
                    .map(|_| ())
                    .map_err(CoreError::from)
            });
            return Err(err);
        }
    }
    Ok(RunStarted {
        project_id: run.project_id,
        run_id: run.id,
        job_id: ack.job_id,
    })
}

/// Maps a core plan task type onto the worker's runtime task type
/// vocabulary (ADR-024). Unknown types are rejected before submission.
fn worker_runtime_type(task_type: &str) -> Result<&'static str, CoreError> {
    Ok(match task_type {
        "search" => "search",
        "source_evaluation" => "source_evaluation",
        "normalization" => "normalization",
        "validation" => "validate",
        "synthesis" => "writer",
        other => {
            return Err(CoreError::database(format!(
                "task type '{other}' has no worker runtime mapping"
            )))
        }
    })
}

/// Builds the `plan` member of the research_run job envelope (ADR-024): the
/// approved task tree with the core's task ids, titles, edited descriptions,
/// and dependency edges (core task ids), plus the per-dimension query
/// parameters the worker stages need.
fn approved_plan_wire(
    conn: &rusqlite::Connection,
    plan: &crate::repositories::plans::PlanRecord,
    config: &ResearchConfigRecord,
) -> Result<Value, CoreError> {
    use crate::repositories::plans::Plans;

    let sections = Plans::sections_for_plan(conn, &plan.id)?;
    let tasks = Plans::tasks_for_plan(conn, &plan.id)?;

    let mut section_payloads = Vec::with_capacity(sections.len() + 1);
    let mut emitted: usize = 0;
    for section in &sections {
        let mut task_payloads = Vec::new();
        for task in tasks
            .iter()
            .filter(|t| t.section_id == Some(section.id.clone()))
        {
            task_payloads.push(approved_task_wire(conn, task, section, config)?);
            emitted += 1;
        }
        section_payloads.push(json!({
            "section_id": section.id,
            "title": section.title,
            "dimension": section.dimension,
            "tasks": task_payloads,
        }));
    }
    // Sectionless tasks (gap follow-ups attach to sections, but the schema
    // allows None) still execute: they travel in a synthetic plan-level
    // section so every approved task is in the wire DAG.
    let sectionless: Vec<&TaskRecord> = tasks.iter().filter(|t| t.section_id.is_none()).collect();
    if !sectionless.is_empty() {
        let mut task_payloads = Vec::new();
        let synthetic = crate::repositories::plans::SectionRecord {
            id: plan.id.clone(),
            plan_id: plan.id.clone(),
            title: plan.title.clone(),
            order_index: i64::MAX,
            summary: String::new(),
            dimension: config
                .dimensions
                .first()
                .cloned()
                .unwrap_or_else(|| "general".into()),
            objectives: Vec::new(),
            created_at: 0,
        };
        for task in &sectionless {
            task_payloads.push(approved_task_wire(conn, task, &synthetic, config)?);
            emitted += 1;
        }
        section_payloads.push(json!({
            "section_id": synthetic.id,
            "title": synthetic.title,
            "dimension": synthetic.dimension,
            "tasks": task_payloads,
        }));
    }
    debug_assert_eq!(
        emitted,
        tasks.len(),
        "every approved task must travel in the wire plan"
    );
    Ok(json!({
        "plan_id": plan.id,
        "project_id": plan.project_id,
        "sections": section_payloads,
    }))
}

/// One approved task as the wire shape the worker's strict pydantic models
/// accept: the core's task id verbatim, the user-edited title/description,
/// the runtime type mapping, dependency edges as task ids, and the stage
/// parameters (search query included).
fn approved_task_wire(
    conn: &rusqlite::Connection,
    task: &TaskRecord,
    section: &crate::repositories::plans::SectionRecord,
    config: &ResearchConfigRecord,
) -> Result<Value, CoreError> {
    use crate::repositories::tasks::Tasks;
    let deps = Tasks::dependencies_of(conn, &task.id)?
        .into_iter()
        .map(|dep| Value::String(dep.depends_on_task_id))
        .collect::<Vec<_>>();
    Ok(json!({
        "task_id": task.id,
        "title": task.title,
        "description": task.description,
        "runtime_type": worker_runtime_type(&task.task_type)?,
        "params": {
            "section_id": section.id,
            "dimension": section.dimension,
            "query": format!("{} {}", config.topic, section.dimension)
                .trim()
                .to_string(),
            "topic": config.topic,
            "languages": config.languages,
            "source_types": config.source_types,
            "source_domains": config.source_domains,
        },
        "depends_on": deps,
    }))
}

/// Builds the exact `ResearchConfig` payload the worker's strict pydantic
/// model accepts (`extra="forbid"`): no repository bookkeeping fields.
fn research_config_wire(record: &ResearchConfigRecord) -> Value {
    let time_range = match (record.time_range_from, record.time_range_to) {
        (None, None) => Value::Null,
        (from, to) => json!({
            "from": from.map(crate::vault::format_rfc3339_utc),
            "to": to.map(crate::vault::format_rfc3339_utc),
        }),
    };
    json!({
        "schema_version": "1.0",
        "project_id": record.project_id,
        "domain": record.domain,
        "topic": record.topic,
        "purpose": record.purpose,
        "audience": record.audience,
        "depth": record.depth,
        "dimensions": record.dimensions,
        "time_range": time_range,
        "geographic_scope": record.geographic_scope,
        "languages": record.languages,
        "source_types": record.source_types,
        "source_domains": record.source_domains,
        "update_frequency": record.update_frequency,
    })
}

#[tauri::command]
pub fn run_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<RunGetRequest>,
) -> IpcResponse<Value> {
    wrapped(
        &request.request_id,
        run_get_impl(&state, &request.data.job_id),
    )
}

fn run_get_impl(state: &AppState, job_id: &str) -> Result<Value, CoreError> {
    let mut status = {
        let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
        supervisor.job_status(job_id)?
    };
    // Additive rollup from persisted state (PRD §7): when the worker
    // envelope names its run, attach the core-side per-task view. Locks are
    // taken sequentially, never nested (see run_start_impl).
    {
        let conn = state.conn.lock().expect("database mutex poisoned");
        attach_task_rollup(&conn, &mut status)?;
    }
    Ok(status)
}

/// Attaches `task_rollup` (run status + per-status task counts) to a worker
/// job-status envelope when it carries a `job.run_id` that exists locally.
/// Envelopes without a resolvable run (the hermetic fake worker) pass through
/// unchanged.
fn attach_task_rollup(conn: &rusqlite::Connection, status: &mut Value) -> Result<(), CoreError> {
    let Some(run_id) = status
        .get("job")
        .and_then(|job| job.get("run_id"))
        .and_then(Value::as_str)
    else {
        return Ok(());
    };
    let Some(run) = crate::repositories::runs::Runs::get(conn, run_id)? else {
        return Ok(());
    };
    let tasks = crate::repositories::tasks::Tasks::list_for_run(conn, run_id)?;
    let mut counts: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    for task in &tasks {
        *counts.entry(task.status.clone()).or_insert(0) += 1;
    }
    status["task_rollup"] = json!({
        "run_id": run_id,
        "run_status": run.status,
        "task_counts": counts,
        "tasks": tasks
            .iter()
            .map(|task| json!({"task_id": task.id, "status": task.status}))
            .collect::<Vec<_>>(),
    });
    Ok(())
}

#[tauri::command]
pub fn run_cancel(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<RunCancelRequest>,
) -> IpcResponse<bool> {
    wrapped(
        &request.request_id,
        run_cancel_impl(&state, &request.data.job_id),
    )
}

fn run_cancel_impl(state: &AppState, job_id: &str) -> Result<bool, CoreError> {
    let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
    match supervisor.cancel_job(job_id) {
        // The worker no longer knows the job (restart): converge locally by
        // applying the same cancellation projection the worker's
        // run.cancelled event would drive (ADR-019 state machine; audit F5),
        // so the persisted run cannot dangle at running forever.
        Err(err)
            if err.developer_detail.contains("has no job")
                || err.developer_detail.contains("NOT_FOUND") =>
        {
            drop(supervisor);
            let run_id = {
                let conn = state.conn.lock().expect("database mutex poisoned");
                find_run_by_worker_job(&conn, job_id)
            };
            if let Some(run_id) = run_id {
                let mut conn = state.conn.lock().expect("database mutex poisoned");
                let event = crate::ipc::ResearchEvent::new(
                    run_id.clone(),
                    None,
                    0,
                    crate::ids::now_unix_ms() as u64,
                    "run.cancelled",
                    json!({"reason": "worker job no longer exists"}),
                );
                if persist_local_event(&mut conn, &event).is_ok() {
                    let _ = crate::orchestrator::OrchestratorService::apply_event(
                        &mut conn,
                        &crate::orchestrator::CanonicalEvent::from(&event),
                    );
                }
            }
            Ok(true)
        }
        result => result.map(|_| true),
    }
}

/// Persists a core-originated event (no worker involved): sequence
/// allocation stays per-run and atomic.
fn persist_local_event(
    conn: &mut rusqlite::Connection,
    event: &crate::ipc::ResearchEvent,
) -> Result<(), CoreError> {
    crate::repositories::services::EventService::append_event(
        conn,
        crate::repositories::events::NewEvent {
            run_id: event.run_id.clone(),
            task_id: event.task_id.clone(),
            event_type: event.event_type.clone(),
            payload: serde_json::to_string(&event.payload).map_err(|err| {
                CoreError::database(format!("serialize event payload failed: {err}"))
            })?,
        },
    )
    .map(|_| ())
}

fn find_run_by_worker_job(conn: &rusqlite::Connection, job_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT id FROM runs WHERE worker_job_id = ?1 ORDER BY created_at DESC LIMIT 1",
        rusqlite::params![job_id],
        |row| row.get(0),
    )
    .ok()
}

// ---------------------------------------------------------------------------
// Restart-safe reads (ADR-020 batch 3, ADR-024)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RunLatestGetRequest {
    pub project_id: String,
}

#[tauri::command]
pub fn run_latest_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<RunLatestGetRequest>,
) -> IpcResponse<Value> {
    wrapped(
        &request.request_id,
        run_latest_get_impl(&state, &request.data.project_id),
    )
}

/// The project's latest run read from SQLite (never session state): the
/// persisted task rollup, the plan title, and the FROZEN config snapshot —
/// the config generation the executed plan was generated from, immune to
/// later config edits (audit F4). The live worker envelope is optional
/// enrichment: when the worker no longer knows the job (restart), the
/// persisted rollup stands alone.
/// Public for the real-process smoke test's restart-readback phase.
pub fn run_latest_get_impl(state: &AppState, project_id: &str) -> Result<Value, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    let Some(run) = crate::repositories::runs::Runs::latest_for_project(&conn, project_id)? else {
        return Ok(Value::Null);
    };
    let plan = crate::repositories::plans::Plans::get(&conn, &run.plan_id)?;
    let config = plan
        .as_ref()
        .and_then(|plan| {
            crate::repositories::configs::ResearchConfigs::get(&conn, &plan.research_config_id)
                .ok()
                .flatten()
        })
        .map(|record| {
            serde_json::to_value(crate::projections::research_config_view(&record))
                .unwrap_or(Value::Null)
        })
        .unwrap_or(Value::Null);

    // Persisted rollup (same shape as run_get's task_rollup).
    let tasks = crate::repositories::tasks::Tasks::list_for_run(&conn, &run.id)?;
    let mut counts: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    for task in &tasks {
        *counts.entry(task.status.clone()).or_insert(0) += 1;
    }
    Ok(json!({
        "run": {
            "id": run.id,
            "project_id": run.project_id,
            "plan_id": run.plan_id,
            "status": run.status,
            "worker_job_id": run.worker_job_id,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "created_at": run.created_at,
            "updated_at": run.updated_at,
        },
        "task_rollup": {
            "run_id": run.id,
            "run_status": run.status,
            "task_counts": counts,
            "tasks": tasks
                .iter()
                .map(|task| json!({"task_id": task.id, "status": task.status}))
                .collect::<Vec<_>>(),
        },
        "plan_title": plan.as_ref().map(|p| p.title.clone()).unwrap_or_default(),
        "config_snapshot": config,
    }))
}

#[tauri::command]
pub fn plan_latest_view(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Value> {
    wrapped(
        &request.request_id,
        plan_latest_view_impl(&state, &request.data.project_id),
    )
}

/// The full sectioned `PlanView` of the latest plan generation, read from
/// SQLite — the persisted sections replace the frontend's session cache
/// (audit F4).
fn plan_latest_view_impl(state: &AppState, project_id: &str) -> Result<Value, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    let plan = crate::repositories::plans::Plans::latest_for_project(&conn, project_id)?
        .ok_or_else(|| CoreError::database(format!("project '{project_id}' has no plan")))?;
    let view = crate::projections::plan_view(&conn, &plan)?;
    serde_json::to_value(view)
        .map_err(|err| CoreError::database(format!("serializing plan view failed: {err}")))
}

#[tauri::command]
pub fn gap_report_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Value> {
    wrapped(
        &request.request_id,
        gap_report_get_impl(&state, &request.data.project_id),
    )
}

/// The decision-merged gap report: persisted `gap_decisions` included, so
/// the frontend no longer bridges them through a session map (audit F4).
fn gap_report_get_impl(state: &AppState, project_id: &str) -> Result<Value, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    let view = crate::projections::gap_report(&conn, project_id)?;
    serde_json::to_value(view)
        .map_err(|err| CoreError::database(format!("serializing gap report failed: {err}")))
}

// ---------------------------------------------------------------------------
// Project-scoped repository listings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProjectScopedRequest {
    pub project_id: String,
}

#[tauri::command]
pub fn sources_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Vec<SourceRecord>> {
    wrapped(
        &request.request_id,
        sources_list_impl(&state, &request.data.project_id),
    )
}

fn sources_list_impl(state: &AppState, project_id: &str) -> Result<Vec<SourceRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::sources::Sources::list_for_project(&conn, project_id)
}

#[tauri::command]
pub fn knowledge_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Vec<KnowledgeNodeRecord>> {
    wrapped(
        &request.request_id,
        knowledge_list_impl(&state, &request.data.project_id),
    )
}

fn knowledge_list_impl(
    state: &AppState,
    project_id: &str,
) -> Result<Vec<KnowledgeNodeRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::knowledge::KnowledgeNodes::list_for_project(&conn, project_id)
}

#[tauri::command]
pub fn claims_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Vec<ClaimRecord>> {
    wrapped(
        &request.request_id,
        claims_list_impl(&state, &request.data.project_id),
    )
}

fn claims_list_impl(state: &AppState, project_id: &str) -> Result<Vec<ClaimRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::claims::Claims::list_for_project(&conn, project_id)
}

#[tauri::command]
pub fn relations_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<Vec<RelationRecord>> {
    wrapped(
        &request.request_id,
        relations_list_impl(&state, &request.data.project_id),
    )
}

fn relations_list_impl(
    state: &AppState,
    project_id: &str,
) -> Result<Vec<RelationRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::repositories::relations::Relations::list_for_project(&conn, project_id)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvidenceListByClaimRequest {
    pub project_id: String,
    pub claim_id: String,
}

/// Evidence linked to one claim, in the frontend evidence shape. The claim
/// link lives in `claim_evidence`; rows of other projects never leak (an
/// unknown claim lists nothing, mirroring the mock). The mock's
/// reveal-gating is a simulation-only concept and does not apply to
/// persisted state (ADR-020).
#[tauri::command]
pub fn evidence_list_by_claim(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<EvidenceListByClaimRequest>,
) -> IpcResponse<Vec<crate::projections::EvidenceView>> {
    wrapped(
        &request.request_id,
        evidence_list_by_claim_impl(&state, &request.data.project_id, &request.data.claim_id),
    )
}

fn evidence_list_by_claim_impl(
    state: &AppState,
    project_id: &str,
    claim_id: &str,
) -> Result<Vec<crate::projections::EvidenceView>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::projects::Projects::get(&conn, project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{project_id}' not found"
        )));
    }
    let records: Vec<_> = crate::repositories::evidence::Evidence::list_for_claim(&conn, claim_id)?
        .into_iter()
        .filter(|record| record.project_id == project_id)
        .collect();
    Ok(crate::projections::evidence_views(claim_id, &records))
}

/// The knowledge-graph projection assembled from the knowledge and relation
/// repositories (no graph-specific tables; ADR-020).
#[tauri::command]
pub fn graph_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<crate::projections::GraphProjection> {
    wrapped(
        &request.request_id,
        graph_get_impl(&state, &request.data.project_id),
    )
}

fn graph_get_impl(
    state: &AppState,
    project_id: &str,
) -> Result<crate::projections::GraphProjection, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::projections::graph(&conn, project_id)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GapActionRequest {
    pub project_id: String,
    pub gap_id: String,
}

#[tauri::command]
pub fn gap_approve_proposal(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<GapActionRequest>,
) -> IpcResponse<crate::projections::GapReportView> {
    wrapped(
        &request.request_id,
        gap_approve_proposal_impl(&state, &request.data.project_id, &request.data.gap_id),
    )
}

fn gap_approve_proposal_impl(
    state: &AppState,
    project_id: &str,
    gap_id: &str,
) -> Result<crate::projections::GapReportView, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    GapService::approve(&mut conn, project_id, gap_id)
}

#[tauri::command]
pub fn gap_dismiss_proposal(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<GapActionRequest>,
) -> IpcResponse<crate::projections::GapReportView> {
    wrapped(
        &request.request_id,
        gap_dismiss_proposal_impl(&state, &request.data.project_id, &request.data.gap_id),
    )
}

fn gap_dismiss_proposal_impl(
    state: &AppState,
    project_id: &str,
    gap_id: &str,
) -> Result<crate::projections::GapReportView, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    GapService::dismiss(&mut conn, project_id, gap_id)
}

/// Event listing: project-scoped, optionally narrowed to one run of that
/// project. Ordered by (run, sequence); `after_sequence` applies per run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventsListRequest {
    pub project_id: String,
    /// Restrict to one run (must belong to the project).
    #[serde(default)]
    pub run_id: Option<String>,
    #[serde(default)]
    pub after_sequence: i64,
    #[serde(default = "default_event_limit")]
    pub limit: u32,
}

fn default_event_limit() -> u32 {
    100
}

#[tauri::command]
pub fn events_list(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<EventsListRequest>,
) -> IpcResponse<Vec<EventRecord>> {
    wrapped(&request.request_id, events_list_impl(&state, request.data))
}

fn events_list_impl(
    state: &AppState,
    request: EventsListRequest,
) -> Result<Vec<EventRecord>, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    let runs = crate::repositories::runs::Runs::list_for_project(&conn, &request.project_id)?;
    let selected: Vec<RunRecord> = match &request.run_id {
        Some(run_id) => {
            let run = runs
                .into_iter()
                .find(|run| &run.id == run_id)
                .ok_or_else(|| {
                    CoreError::database(format!(
                        "run '{run_id}' does not belong to project '{}'",
                        request.project_id
                    ))
                })?;
            vec![run]
        }
        None => runs,
    };
    let mut events = Vec::new();
    for run in selected {
        events.extend(crate::repositories::events::Events::list_after(
            &conn,
            &run.id,
            request.after_sequence,
            request.limit,
        )?);
    }
    Ok(events)
}

// ---------------------------------------------------------------------------
// Secrets (references only; values never leave the keychain)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SecretsSetProviderKeyRequest {
    pub provider: String,
    /// The secret value; crosses IPC exactly once to be stored and is never
    /// returned, logged, or persisted anywhere else.
    pub api_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SecretStored {
    pub reference: SecretRef,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SecretsListProvidersRequest {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderKeyStatus {
    pub name: String,
    pub base_url: String,
    pub model: String,
    /// Keychain reference; never a value.
    pub key_ref: SecretRef,
    /// Whether the keychain currently holds a value for the reference.
    pub has_key: bool,
}

#[tauri::command]
pub fn secrets_set_provider_key(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<SecretsSetProviderKeyRequest>,
) -> IpcResponse<SecretStored> {
    wrapped(
        &request.request_id,
        secrets_set_provider_key_impl(&state, request.data),
    )
}

fn secrets_set_provider_key_impl(
    state: &AppState,
    request: SecretsSetProviderKeyRequest,
) -> Result<SecretStored, CoreError> {
    let provider = request.provider.trim().to_string();
    if provider.is_empty() {
        return Err(CoreError::database("provider name must not be empty"));
    }
    if request.api_key.is_empty() {
        return Err(CoreError::database("provider key must not be empty"));
    }
    let reference = SecretRef::new(provider, "api_key");
    state.keychain.set(&reference, &request.api_key)?;
    Ok(SecretStored { reference })
}

#[tauri::command]
pub fn secrets_list_providers(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<SecretsListProvidersRequest>,
) -> IpcResponse<Vec<ProviderKeyStatus>> {
    wrapped(&request.request_id, secrets_list_providers_impl(&state))
}

fn secrets_list_providers_impl(state: &AppState) -> Result<Vec<ProviderKeyStatus>, CoreError> {
    let config = FileConfigStore::new(&state.config_path).load()?;
    let mut statuses = Vec::with_capacity(config.providers.len());
    for provider in &config.providers {
        statuses.push(ProviderKeyStatus {
            name: provider.name.clone(),
            base_url: provider.base_url.clone(),
            model: provider.model.clone(),
            key_ref: provider.api_key_ref.clone(),
            has_key: state.keychain.get(&provider.api_key_ref)?.is_some(),
        });
    }
    Ok(statuses)
}

// ---------------------------------------------------------------------------
// Coverage and vault export
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn coverage_get(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<CoverageReport> {
    wrapped(
        &request.request_id,
        coverage_get_impl(&state, &request.data.project_id),
    )
}

fn coverage_get_impl(state: &AppState, project_id: &str) -> Result<CoverageReport, CoreError> {
    let conn = state.conn.lock().expect("database mutex poisoned");
    crate::coverage::compute(&conn, project_id)
}

#[tauri::command]
pub fn vault_export_project(
    state: tauri::State<'_, AppState>,
    request: IpcRequest<ProjectScopedRequest>,
) -> IpcResponse<VaultExportResult> {
    wrapped(
        &request.request_id,
        vault_export_project_impl(&state, &request.data.project_id),
    )
}

fn vault_export_project_impl(
    state: &AppState,
    project_id: &str,
) -> Result<VaultExportResult, CoreError> {
    let mut conn = state.conn.lock().expect("database mutex poisoned");
    if crate::repositories::projects::Projects::get(&conn, project_id)?.is_none() {
        return Err(CoreError::database(format!(
            "project '{project_id}' not found"
        )));
    }
    VaultService::export_project(&mut conn, project_id, &state.vault_root)
}

/// Builds the transport factory from the worker config: the hermetic fake by
/// default, the HTTP/Python launcher when `worker.transport = "http"`.
pub fn transport_factory_from_config(
    worker: &WorkerConfig,
) -> Box<crate::worker::TransportFactory> {
    if worker.is_http() {
        let launcher = worker.clone();
        Box::new(move || {
            Ok(Box::new(
                crate::worker::http::HttpWorkerTransport::launching(launcher.clone()),
            ))
        })
    } else {
        let (factory, _handle) = crate::worker::fake::FakeWorkerScript::healthy().factory();
        factory
    }
}

#[cfg(test)]
// Tests deliberately tweak Default-constructed requests and configs.
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::ResearchConfigs;
    use crate::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
    use crate::repositories::plans::{NewPlan, NewTask, PlanDraft};
    use crate::repositories::runs::Runs;
    use crate::repositories::services::{EventService, PlanService};
    use crate::repositories::sources::{NewSource, Sources};
    use crate::repositories::with_write_tx;
    use crate::secrets::{FakeKeychain, ProviderConfig};
    use crate::worker::fake::{FakeClock, FakeSleeper, FakeWorkerScript};
    use crate::worker::{RestartPolicy, Supervisor};
    use serde_json::json;
    use std::sync::Arc;

    /// Builds an AppState around an in-memory database, the fake worker, and
    /// a temp config/vault area. No Tauri app is involved.
    fn test_state() -> AppState {
        let conn = migrated_memory_db().unwrap();
        let (factory, _handle) = FakeWorkerScript::healthy().factory();
        let supervisor = Supervisor::new(
            factory,
            RestartPolicy::default(),
            Box::new(FakeClock::default()),
            Box::new(FakeSleeper::default()),
        );
        let dir = tempfile::tempdir().unwrap();
        let root = dir.keep();
        AppState::new(
            conn,
            supervisor,
            Arc::new(FakeKeychain::new()),
            root.join("config").join("app.json"),
            root.join("vault"),
        )
    }

    fn create_request() -> ProjectCreateRequest {
        ProjectCreateRequest {
            name: "BCI".into(),
            description: "notes".into(),
            config: ConfigInput {
                domain: "AI".into(),
                topic: "LLM scaling".into(),
                dimensions: vec!["theory".into()],
                ..default_config_input()
            },
        }
    }

    /// Test state plus the fake worker's observable handle.
    fn test_state_with_handle() -> (AppState, crate::worker::fake::FakeHandle) {
        let conn = migrated_memory_db().unwrap();
        let (factory, handle) = FakeWorkerScript::healthy().factory();
        let supervisor = Supervisor::new(
            factory,
            RestartPolicy::default(),
            Box::new(FakeClock::default()),
            Box::new(FakeSleeper::default()),
        );
        let dir = tempfile::tempdir().unwrap();
        let root = dir.keep();
        (
            AppState::new(
                conn,
                supervisor,
                Arc::new(FakeKeychain::new()),
                root.join("config").join("app.json"),
                root.join("vault"),
            ),
            handle,
        )
    }

    /// Test state whose worker can never be started (every spawn fails), for
    /// submit-failure convergence paths.
    fn test_state_with_dead_worker() -> AppState {
        let conn = migrated_memory_db().unwrap();
        let mut script = FakeWorkerScript::healthy();
        script.spawn_failures_before_success = u32::MAX;
        let (factory, _handle) = script.factory();
        let supervisor = Supervisor::new(
            factory,
            RestartPolicy {
                max_restarts: 1,
                base_delay_ms: 1,
                max_delay_ms: 1,
            },
            Box::new(FakeClock::default()),
            Box::new(FakeSleeper::default()),
        );
        let dir = tempfile::tempdir().unwrap();
        let root = dir.keep();
        AppState::new(
            conn,
            supervisor,
            Arc::new(FakeKeychain::new()),
            root.join("config").join("app.json"),
            root.join("vault"),
        )
    }

    /// Creates a project and regenerates the full scripted plan draft (two
    /// dimensions kept small: theory + experiments), returning
    /// `(project_id, plan_id)`.
    fn seeded_scripted_plan(state: &AppState) -> (String, String) {
        let project_id = project_create_impl(
            state,
            ProjectCreateRequest {
                name: "Scripted".into(),
                description: String::new(),
                config: ConfigInput {
                    domain: "AI".into(),
                    topic: "LLM scaling".into(),
                    dimensions: vec!["theory".into(), "experiments".into()],
                    ..default_config_input()
                },
            },
        )
        .unwrap()
        .project
        .id;
        let plan = {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            PlanService::regenerate_plan(&mut conn, &project_id).unwrap()
        };
        (project_id, plan.id)
    }

    /// Creates a project and returns its id.
    fn seeded_project(state: &AppState) -> String {
        project_create_impl(state, create_request())
            .unwrap()
            .project
            .id
    }

    /// Creates a project + one approved plan holding one task.
    fn seeded_plan(state: &AppState) -> (String, String) {
        let project_id = seeded_project(state);
        let config_id = {
            let conn = state.conn.lock().expect("database mutex poisoned");
            ResearchConfigs::list_for_project(&conn, &project_id).unwrap()[0]
                .id
                .clone()
        };
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let created = PlanService::create_plan(
            &mut conn,
            PlanDraft {
                plan: NewPlan {
                    project_id: project_id.clone(),
                    research_config_id: config_id,
                    title: "T".into(),
                    rationale: String::new(),
                },
                sections: vec![],
                tasks: vec![NewTask {
                    title: "search theory".into(),
                    description: String::new(),
                    task_type: "search".into(),
                    idempotency_key: "k-1".into(),
                    section_index: None,
                    depends_on: vec![],
                }],
            },
        )
        .unwrap();
        (project_id, created.plan.id)
    }

    #[test]
    fn core_info_reports_versions() {
        let resp = core_info();
        assert!(resp.error.is_none());
        let info = resp.data.unwrap();
        assert_eq!(info.app_name, "Morpho Research OS");
        assert_eq!(info.app_version, "0.0.1");
        assert_eq!(info.ipc_schema_version, IPC_SCHEMA_VERSION);
        assert_eq!(info.event_envelope, "research.event.v1");
        assert_eq!(info.worker_protocol_version, "1.0");
        assert_eq!(
            info.database_schema_version,
            crate::db::LATEST_SCHEMA_VERSION
        );
    }

    #[test]
    fn ping_round_trips_the_envelope() {
        let request = IpcRequest::new(
            "req-ping-1",
            PingRequest {
                echo: "hello".into(),
            },
        );
        let resp = ping(request);
        assert_eq!(resp.request_id, "req-ping-1");
        assert!(resp.error.is_none());
        assert_eq!(resp.data.unwrap().echo, "hello");
    }

    #[test]
    fn project_lifecycle_create_get_list_archive() {
        let state = test_state();
        let created = project_create_impl(&state, create_request()).unwrap();
        assert_eq!(created.project.status, "active");
        assert_eq!(created.config.project_id, created.project.id);
        assert_eq!(created.config.dimensions, vec!["theory".to_string()]);

        let project_id = created.project.id;
        assert_eq!(
            project_get_impl(&state, &project_id).unwrap().unwrap().name,
            "BCI"
        );
        assert_eq!(project_list_impl(&state).unwrap().len(), 1);

        let archived = project_archive_impl(&state, &project_id).unwrap().unwrap();
        assert_eq!(archived.status, "archived");
        assert!(project_archive_impl(&state, "ghost").unwrap().is_none());
        assert!(project_get_impl(&state, "ghost").unwrap().is_none());

        let err = project_create_impl(
            &state,
            ProjectCreateRequest {
                name: "  ".into(),
                ..create_request()
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("name must not be empty"));
    }

    #[test]
    fn config_get_put_round_trips_and_rejects_unknown_transports() {
        let state = test_state();
        assert_eq!(
            config_get_impl(&state).unwrap().worker.transport,
            "fake",
            "absent config defaults to the hermetic fake"
        );

        let mut config = AppConfig::default();
        config.providers.push(ProviderConfig {
            name: "openai".into(),
            base_url: "https://api.example.com".into(),
            model: "gpt-test".into(),
            api_key_ref: SecretRef::new("openai", "api_key"),
            timeout_ms: 30_000,
            max_retries: 2,
        });
        config.worker.transport = "http".into();
        let stored = config_put_impl(&state, config.clone()).unwrap();
        assert_eq!(stored, config);
        assert_eq!(config_get_impl(&state).unwrap().worker.transport, "http");

        let mut bad = config;
        bad.worker.transport = "carrier-pigeon".into();
        let err = config_put_impl(&state, bad).unwrap_err();
        assert!(err.developer_detail.contains("carrier-pigeon"));
    }

    #[test]
    fn plan_list_and_approve_persist_through_repositories() {
        let state = test_state();
        let (project_id, plan_id) = seeded_plan(&state);

        let plans = plan_list_impl(&state, &project_id).unwrap();
        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].plan.status, "draft");
        assert_eq!(plans[0].tasks.len(), 1);

        let approved = plan_approve_impl(&state, &plan_id).unwrap().unwrap();
        assert_eq!(approved.status, "approved");
        assert!(plan_approve_impl(&state, "ghost").unwrap().is_none());
    }

    #[test]
    fn run_start_creates_run_and_submits_the_worker_job() {
        let state = test_state();
        let (project_id, plan_id) = seeded_plan(&state);
        plan_approve_impl(&state, &plan_id).unwrap();

        let started = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap();
        assert_eq!(started.project_id, project_id);
        assert_ne!(started.run_id, started.job_id);
        assert!(!started.job_id.is_empty());

        // The run record exists; the fake worker acknowledged the job.
        let conn = state.conn.lock().expect("database mutex poisoned");
        assert!(Runs::get(&conn, &started.run_id).unwrap().is_some());
        drop(conn);
        let status = run_get_impl(&state, &started.job_id).unwrap();
        assert_eq!(status["job"]["job_id"], json!(started.job_id));

        assert!(run_cancel_impl(&state, &started.job_id).unwrap());
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: "ghost".into(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn run_start_rejects_unapproved_rejected_and_superseded_plans() {
        let state = test_state();
        let (_project_id, plan_id) = seeded_plan(&state);

        // Draft: refused before any run or job exists.
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("draft"));
        assert!(err.user_message.contains("批准"));

        // Rejected: refused as well.
        let _ = plan_reject_impl(&state, &_project_id).unwrap();
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("rejected"));

        // The approve_plan flag must not bypass the persisted gate.
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("rejected"));
        let conn = state.conn.lock().expect("database mutex poisoned");
        assert!(
            Runs::list_for_project(&conn, &_project_id)
                .unwrap()
                .is_empty(),
            "no run row may appear for a refused start"
        );
    }

    #[test]
    fn run_start_refuses_a_second_active_run_but_allows_after_terminal() {
        let state = test_state();
        let (_project_id, plan_id) = seeded_plan(&state);
        plan_approve_impl(&state, &plan_id).unwrap();

        let first = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap();

        // While the first run is in flight, starting again is refused.
        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("active run"));

        // A terminal run (here: cancelled) re-opens the plan for a new run.
        {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            with_write_tx(&mut conn, |tx| {
                Runs::update_status(tx, &first.run_id, "cancelled").map(|_| ())
            })
            .unwrap();
        }
        let second = run_start_impl(
            &state,
            RunStartRequest {
                plan_id,
                approve_plan: true,
            },
        )
        .unwrap();
        assert_ne!(second.run_id, first.run_id);
    }

    #[test]
    fn run_start_carries_the_approved_task_tree_with_core_ids() {
        let (state, handle) = test_state_with_handle();
        let (project_id, plan_id) = seeded_scripted_plan(&state);
        plan_approve_impl(&state, &plan_id).unwrap();

        let started = run_start_impl(
            &state,
            RunStartRequest {
                plan_id: plan_id.clone(),
                approve_plan: true,
            },
        )
        .unwrap();

        let requests = handle.submitted_requests();
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.run_id, started.run_id);
        let plan = request.plan.as_ref().expect("the approved plan travels");
        assert_eq!(plan["plan_id"], json!(plan_id));
        assert_eq!(plan["project_id"], json!(project_id));

        // Sections carry the core's section ids and the tasks the core's
        // task ids verbatim, with dependency edges as task ids and the
        // search query derived from topic + dimension.
        let sections = plan["sections"].as_array().unwrap();
        assert_eq!(
            sections.len(),
            3,
            "two dimension sections plus the synthesis section"
        );
        let tasks: Vec<&serde_json::Value> = sections
            .iter()
            .flat_map(|section| section["tasks"].as_array().unwrap())
            .collect();
        let types: Vec<&str> = tasks
            .iter()
            .map(|task| task["runtime_type"].as_str().unwrap())
            .collect();
        assert_eq!(
            types,
            vec![
                "search",
                "source_evaluation",
                "normalization", //
                "search",
                "source_evaluation",
                "normalization", //
                "validate",
                "writer",
            ],
            "runtime mapping in execution order"
        );
        let validation = tasks[6];
        let normalize_ids: Vec<String> = [2_usize, 5]
            .iter()
            .map(|i| tasks[*i]["task_id"].as_str().unwrap().to_string())
            .collect();
        let deps: Vec<String> = validation["depends_on"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            deps, normalize_ids,
            "validation waits for both normalizations"
        );
        let search = tasks[0];
        assert!(
            search["params"]["query"]
                .as_str()
                .unwrap()
                .contains("LLM scaling"),
            "the query derives from the config topic"
        );
        // Real core task ids: every task_id resolves to a tasks row.
        let conn = state.conn.lock().expect("database mutex poisoned");
        for task in &tasks {
            let id = task["task_id"].as_str().unwrap();
            assert!(
                crate::repositories::tasks::Tasks::get(&conn, id)
                    .unwrap()
                    .is_some(),
                "wire task id '{id}' must be a core task id"
            );
        }
    }

    #[test]
    fn run_start_without_a_worker_converges_instead_of_a_fake_running_run() {
        // The worker never becomes available: the run row must not linger.
        let state = test_state_with_dead_worker();
        let (_project_id, plan_id) = seeded_plan(&state);
        plan_approve_impl(&state, &plan_id).unwrap();

        let err = run_start_impl(
            &state,
            RunStartRequest {
                plan_id,
                approve_plan: true,
            },
        )
        .unwrap_err();
        assert_eq!(err.code, CoreErrorCode::WorkerNotAvailable);
        let conn = state.conn.lock().expect("database mutex poisoned");
        assert!(
            Runs::list_for_project(&conn, &_project_id)
                .unwrap()
                .is_empty(),
            "a failed submission must not leave a converged-looking run"
        );
    }

    #[test]
    fn run_get_attaches_the_persisted_task_rollup() {
        let state = test_state();
        let (project_id, plan_id) = seeded_plan(&state);
        // One run over the plan; project it to completion through the
        // orchestrator so the rollup has something to count.
        let run = {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            let run = with_write_tx(&mut conn, |tx| {
                Runs::insert(
                    tx,
                    &crate::repositories::runs::NewRun {
                        id: None,
                        project_id: project_id.clone(),
                        plan_id: plan_id.clone(),
                        started_at: None,
                    },
                )
            })
            .unwrap();
            let task_id = crate::repositories::plans::Plans::tasks_for_plan(&conn, &plan_id)
                .unwrap()[0]
                .id
                .clone();
            for (task_id, event_type, payload) in [
                (None::<String>, "run.started", json!({})),
                (Some(task_id.clone()), "task.started", json!({})),
                (Some(task_id), "task.completed", json!({})),
            ] {
                crate::orchestrator::OrchestratorService::apply_event(
                    &mut conn,
                    &crate::orchestrator::CanonicalEvent::new(
                        &run.id, task_id, event_type, payload,
                    ),
                )
                .unwrap();
            }
            run
        };

        let mut envelope = json!({"job": {"job_id": "job-1", "run_id": run.id}});
        {
            let conn = state.conn.lock().expect("database mutex poisoned");
            attach_task_rollup(&conn, &mut envelope).unwrap();
        }
        assert_eq!(envelope["task_rollup"]["run_status"], json!("completed"));
        assert_eq!(
            envelope["task_rollup"]["task_counts"],
            json!({"COMPLETED": 1})
        );
        assert_eq!(
            envelope["task_rollup"]["tasks"][0]["status"],
            json!("COMPLETED")
        );

        // Envelopes without a resolvable run pass through unchanged.
        let mut bare = json!({"job": {"job_id": "job-2"}});
        {
            let conn = state.conn.lock().expect("database mutex poisoned");
            attach_task_rollup(&conn, &mut bare).unwrap();
        }
        assert!(bare.get("task_rollup").is_none());
    }

    #[test]
    fn listings_are_project_scoped() {
        let state = test_state();
        let first = seeded_project(&state);
        let second = seeded_project(&state);

        let source = |state: &AppState, project_id: &str, canonical: &str| {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            with_write_tx(&mut conn, |tx| {
                Sources::upsert_by_canonical_url(
                    tx,
                    &NewSource {
                        project_id: project_id.to_string(),
                        url: format!("https://example.com/{canonical}"),
                        canonical_url: canonical.to_string(),
                        title: canonical.to_string(),
                        source_type: "web".into(),
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        };
        source(&state, &first, "a");
        source(&state, &second, "b");
        assert_eq!(sources_list_impl(&state, &first).unwrap().len(), 1);
        assert_eq!(sources_list_impl(&state, &second).unwrap().len(), 1);
        assert!(sources_list_impl(&state, &first).unwrap()[0]
            .canonical_url
            .contains('a'));

        assert!(knowledge_list_impl(&state, &first).unwrap().is_empty());
        assert!(claims_list_impl(&state, &first).unwrap().is_empty());
        assert!(relations_list_impl(&state, &first).unwrap().is_empty());
    }

    #[test]
    fn events_list_is_project_scoped_and_run_filtered() {
        let state = test_state();
        let (project_id, plan_id) = seeded_plan(&state);
        let run = {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            with_write_tx(&mut conn, |tx| {
                Runs::insert(
                    tx,
                    &crate::repositories::runs::NewRun {
                        id: None,
                        project_id: project_id.clone(),
                        plan_id: plan_id.clone(),
                        started_at: None,
                    },
                )
            })
            .unwrap()
        };
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        for sequence in 1..=3 {
            EventService::append_event(
                &mut conn,
                crate::repositories::events::NewEvent {
                    run_id: run.id.clone(),
                    task_id: None,
                    event_type: "run.progress".into(),
                    payload: format!(r#"{{"n":{sequence}}}"#),
                },
            )
            .unwrap();
        }
        drop(conn);

        let all = events_list_impl(
            &state,
            EventsListRequest {
                project_id: project_id.clone(),
                run_id: None,
                after_sequence: 0,
                limit: 10,
            },
        )
        .unwrap();
        assert_eq!(all.len(), 3);

        let tail = events_list_impl(
            &state,
            EventsListRequest {
                project_id: project_id.clone(),
                run_id: Some(run.id.clone()),
                after_sequence: 2,
                limit: 10,
            },
        )
        .unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].sequence, 3);

        // A run of another project is rejected, not silently empty.
        let other = seeded_project(&state);
        let err = events_list_impl(
            &state,
            EventsListRequest {
                project_id: other,
                run_id: Some(run.id),
                after_sequence: 0,
                limit: 10,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("does not belong to project"));
    }

    #[test]
    fn secrets_store_values_and_list_references_only() {
        let state = test_state();
        let mut config = AppConfig::default();
        config.providers.push(ProviderConfig {
            name: "glm".into(),
            base_url: "https://api.example.com".into(),
            model: "m-test".into(),
            api_key_ref: SecretRef::new("glm", "api_key"),
            timeout_ms: 30_000,
            max_retries: 2,
        });
        config_put_impl(&state, config).unwrap();

        // Fake key material built at runtime; never a literal credential.
        let key = format!("sk-{}", "k".repeat(20));
        let stored = secrets_set_provider_key_impl(
            &state,
            SecretsSetProviderKeyRequest {
                provider: "glm".into(),
                api_key: key.clone(),
            },
        )
        .unwrap();
        assert_eq!(
            stored.reference.to_string(),
            "keychain://morpho/glm/api_key"
        );

        let providers = secrets_list_providers_impl(&state).unwrap();
        assert_eq!(providers.len(), 1);
        assert!(providers[0].has_key);
        assert_eq!(providers[0].key_ref.provider, "glm");
        assert_eq!(providers[0].key_ref.key_name, "api_key");
        let serialized = serde_json::to_string(&providers).unwrap();
        assert!(!serialized.contains(&key), "secret value leaked over IPC");
        assert!(
            serialized.contains("\"key_name\":\"api_key\""),
            "references cross IPC as structured refs: {serialized}"
        );

        let err = secrets_set_provider_key_impl(
            &state,
            SecretsSetProviderKeyRequest {
                provider: " ".into(),
                api_key: key,
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("provider name"));
    }

    #[test]
    fn coverage_get_reports_zero_for_a_fresh_project() {
        let state = test_state();
        let project_id = seeded_project(&state);
        let report = coverage_get_impl(&state, &project_id).unwrap();
        assert_eq!(report.project_id, project_id);
        assert_eq!(report.dimensions.len(), 1);
        assert_eq!(report.dimensions[0].dimension, "theory");
        assert!(report.overall < crate::coverage::GAP_COVERAGE_THRESHOLD);

        let err = coverage_get_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn vault_export_writes_into_the_per_project_root() {
        let state = test_state();
        let project_id = seeded_project(&state);
        {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            with_write_tx(&mut conn, |tx| {
                KnowledgeNodes::upsert_by_slug(
                    tx,
                    &NewKnowledgeNode {
                        id: None,
                        project_id: project_id.clone(),
                        node_type: "Concept".into(),
                        title: "Transformer".into(),
                        slug: "transformer".into(),
                        summary: "attention".into(),
                        confidence: "high".into(),
                        aliases: vec![],
                        tags: vec![],
                        source_ids: vec![],
                        claim_ids: vec![],
                    },
                )
                .map(|_| ())
            })
            .unwrap();
        }

        let result = vault_export_project_impl(&state, &project_id).unwrap();
        assert_eq!(result.written, 2); // concept note + per-project map MOC
        assert_eq!(result.maps, 1);
        assert!(state
            .vault_root
            .join(&project_id)
            .join("Concepts")
            .join("transformer.md")
            .exists());

        // Re-export of identical content is detected as unchanged.
        let again = vault_export_project_impl(&state, &project_id).unwrap();
        assert_eq!(again.unchanged, 2);
        assert_eq!(again.written, 0);

        let err = vault_export_project_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn transport_factory_follows_the_config_selector() {
        // Both branches must build without launching anything: the http
        // factory only spawns when the supervisor calls spawn().
        let mut fake = transport_factory_from_config(&WorkerConfig::default());
        let mut fake_transport = fake().unwrap();
        fake_transport.spawn("token-not-a-secret").unwrap();
        assert!(fake_transport.is_alive());

        let mut http_config = WorkerConfig::default();
        http_config.transport = "http".into();
        let mut http = transport_factory_from_config(&http_config);
        let http_transport = http().unwrap();
        assert!(!http_transport.is_alive(), "no process spawned yet");
    }

    // -----------------------------------------------------------------
    // IPC batch 2 (ADR-020)
    // -----------------------------------------------------------------

    /// A project whose config carries two dimensions so the scripted
    /// planner builds two dimension sections plus the synthesis section.
    fn two_dimension_project(state: &AppState) -> String {
        project_create_impl(
            state,
            ProjectCreateRequest {
                name: "BCI".into(),
                description: String::new(),
                config: ConfigInput {
                    domain: "AI".into(),
                    topic: "LLM scaling".into(),
                    dimensions: vec!["theory".into(), "market".into()],
                    ..default_config_input()
                },
            },
        )
        .unwrap()
        .project
        .id
    }

    #[test]
    fn plan_regenerate_builds_the_scripted_draft_and_supersedes() {
        let state = test_state();
        let project_id = two_dimension_project(&state);

        let first = plan_regenerate_impl(&state, &project_id).unwrap();
        assert_eq!(first.status, "draft");
        assert!(first.title.contains("LLM scaling"));
        assert!(!first.rationale.is_empty());
        // Two dimension sections + the cross-validation section, with the
        // mock planner's task mix (search / evaluate / normalize + 2).
        assert_eq!(first.sections.len(), 3);
        let kinds: Vec<&str> = first
            .sections
            .iter()
            .flat_map(|section| section.tasks.iter().map(|task| task.kind.as_str()))
            .collect();
        assert_eq!(
            kinds,
            vec![
                "search",
                "source_evaluation",
                "normalization",
                "search",
                "source_evaluation",
                "normalization",
                "validation",
                "synthesis"
            ]
        );
        for section in &first.sections {
            assert!(!section.dimension.is_empty());
            assert!(!section.objectives.is_empty());
            for task in &section.tasks {
                assert!(!task.description.is_empty());
            }
        }

        // Regenerating supersedes the previous generation and returns the
        // new draft (the schema's plan generations, ADR-020).
        let second = plan_regenerate_impl(&state, &project_id).unwrap();
        assert_ne!(second.id, first.id);
        assert_eq!(second.status, "draft");
        {
            let conn = state.conn.lock().expect("database mutex poisoned");
            assert_eq!(
                crate::repositories::plans::Plans::get(&conn, &first.id)
                    .unwrap()
                    .unwrap()
                    .status,
                "superseded"
            );
        }

        let err = plan_regenerate_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn plan_update_task_edits_titles_and_descriptions_of_draft_plans() {
        let state = test_state();
        let project_id = two_dimension_project(&state);
        let plan = plan_regenerate_impl(&state, &project_id).unwrap();
        let task_id = {
            let conn = state.conn.lock().expect("database mutex poisoned");
            crate::repositories::plans::Plans::tasks_for_plan(&conn, &plan.id).unwrap()[0]
                .id
                .clone()
        };

        let updated = plan_update_task_impl(
            &state,
            PlanUpdateTaskRequest {
                project_id: project_id.clone(),
                task_id: task_id.clone(),
                title: "检索 theory 维度核心来源".into(),
                description: "更聚焦的检索说明".into(),
            },
        )
        .unwrap();
        let task = &updated.sections[0].tasks[0];
        assert_eq!(task.id, task_id);
        assert_eq!(task.title, "检索 theory 维度核心来源");
        assert_eq!(task.description, "更聚焦的检索说明");

        // An empty title keeps the previous one (mock parity).
        let kept = plan_update_task_impl(
            &state,
            PlanUpdateTaskRequest {
                project_id: project_id.clone(),
                task_id: task_id.clone(),
                title: "   ".into(),
                description: "d".into(),
            },
        )
        .unwrap();
        assert_eq!(kept.sections[0].tasks[0].title, "检索 theory 维度核心来源");

        // Only draft plans are editable; approving closes the edit window.
        let conn = state.conn.lock().expect("database mutex poisoned");
        let plan_id = plan.id.clone();
        drop(conn);
        plan_approve_impl(&state, &plan_id).unwrap();
        let err = plan_update_task_impl(
            &state,
            PlanUpdateTaskRequest {
                project_id,
                task_id,
                title: "t".into(),
                description: "d".into(),
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("draft"), "{err:?}");

        // Unknown tasks and foreign tasks are structured errors.
        let err = plan_update_task_impl(
            &state,
            PlanUpdateTaskRequest {
                project_id: two_dimension_project(&state),
                task_id: "ghost".into(),
                title: "t".into(),
                description: "d".into(),
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn plan_reject_marks_the_latest_generation() {
        let state = test_state();
        let project_id = two_dimension_project(&state);
        plan_regenerate_impl(&state, &project_id).unwrap();

        let rejected = plan_reject_impl(&state, &project_id).unwrap();
        assert_eq!(rejected.status, "rejected");
        {
            let conn = state.conn.lock().expect("database mutex poisoned");
            assert_eq!(
                crate::repositories::plans::Plans::get(&conn, &rejected.id)
                    .unwrap()
                    .unwrap()
                    .status,
                "rejected"
            );
        }

        let err = plan_reject_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("no plan"));
    }

    #[test]
    fn evidence_list_by_claim_returns_linked_evidence_scoped_to_the_project() {
        let state = test_state();
        let project_id = seeded_project(&state);
        let claim_id = {
            let mut conn = state.conn.lock().expect("database mutex poisoned");
            let source = with_write_tx(&mut conn, |tx| {
                Sources::upsert_by_canonical_url(
                    tx,
                    &NewSource {
                        project_id: project_id.clone(),
                        url: "https://example.com/a".into(),
                        canonical_url: "a".into(),
                        title: "A".into(),
                        source_type: "web".into(),
                    },
                )
                .map(|(record, _)| record.id)
            })
            .unwrap();
            let claim = with_write_tx(&mut conn, |tx| {
                crate::repositories::claims::Claims::insert(
                    tx,
                    &crate::repositories::claims::NewClaim {
                        id: None,
                        project_id: project_id.clone(),
                        subject: "S".into(),
                        predicate: "uses".into(),
                        object_value: "attention".into(),
                        scope: String::new(),
                        confidence: "medium".into(),
                        provenance: "run-1".into(),
                    },
                )
                .map(|(record, _)| record)
            })
            .unwrap();
            let evidence = with_write_tx(&mut conn, |tx| {
                crate::repositories::evidence::Evidence::insert(
                    tx,
                    &crate::repositories::evidence::NewEvidence {
                        id: None,
                        project_id: project_id.clone(),
                        source_id: source,
                        quote: "uses attention".into(),
                        value: String::new(),
                        locator: "p. 1".into(),
                        direction: "support".into(),
                    },
                )
                .map(|(record, _)| record)
            })
            .unwrap();
            with_write_tx(&mut conn, |tx| {
                crate::repositories::claims::ClaimEvidence::link(tx, &claim.id, &evidence.id)
                    .map(|_| ())
            })
            .unwrap();
            claim.id
        };

        let listed = evidence_list_by_claim_impl(&state, &project_id, &claim_id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].claim_id, claim_id);
        assert_eq!(listed[0].quote, "uses attention");
        assert_eq!(listed[0].locator.kind, "page");

        // Unknown claims list nothing (mock parity); unknown projects fail.
        assert!(evidence_list_by_claim_impl(&state, &project_id, "ghost")
            .unwrap()
            .is_empty());
        let err = evidence_list_by_claim_impl(&state, "ghost", &claim_id).unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn graph_get_returns_an_empty_projection_for_a_fresh_project() {
        let state = test_state();
        let project_id = seeded_project(&state);
        let projection = graph_get_impl(&state, &project_id).unwrap();
        assert_eq!(projection.project_id, project_id);
        assert!(projection.nodes.is_empty());
        assert!(projection.relations.is_empty());

        let err = graph_get_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn gap_proposals_approve_into_tasks_and_dismiss_into_hidden_dimensions() {
        let state = test_state();
        let project_id = two_dimension_project(&state);
        plan_regenerate_impl(&state, &project_id).unwrap();
        // Complete one task so tasks exist; every dimension still gaps.
        let gap_id = format!("gap:{project_id}:theory");

        // A gap id that is not currently proposed is a structured error.
        let err = gap_approve_proposal_impl(&state, &project_id, "gap:x:nope").unwrap_err();
        assert!(err.developer_detail.contains("not found"));

        let report = gap_approve_proposal_impl(&state, &project_id, &gap_id).unwrap();
        let gap = report.gaps.iter().find(|g| g.id == gap_id).unwrap();
        assert_eq!(gap.proposal_status, "approved");
        let created_task_id = gap.created_task_id.clone().unwrap();

        // The decision created a PENDING follow-up task keyed by the gap id,
        // attached to the plan's first section, claimed by the next run.
        let task = {
            let conn = state.conn.lock().expect("database mutex poisoned");
            crate::repositories::tasks::Tasks::get(&conn, &created_task_id)
                .unwrap()
                .unwrap()
        };
        assert_eq!(task.status, "PENDING");
        assert_eq!(task.idempotency_key, gap_id);
        assert_eq!(task.task_type, "search");
        assert!(task.section_id.is_some());
        assert!(!task.description.is_empty());

        // Approving again is idempotent: the same task, no duplicates.
        let again = gap_approve_proposal_impl(&state, &project_id, &gap_id).unwrap();
        let gap = again.gaps.iter().find(|g| g.id == gap_id).unwrap();
        assert_eq!(
            gap.created_task_id.as_deref(),
            Some(created_task_id.as_str())
        );

        // Dismissing hides the dimension from the report.
        let dismissed = gap_dismiss_proposal_impl(&state, &project_id, &gap_id).unwrap();
        assert!(dismissed.gaps.iter().all(|g| g.id != gap_id));

        // A dismissed gap no longer resolves: the mock surfaces NOT_FOUND.
        let err = gap_dismiss_proposal_impl(&state, &project_id, &gap_id).unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn gap_approval_needs_a_plan_to_attach_the_task_to() {
        let state = test_state();
        let project_id = seeded_project(&state);
        // Fresh project: no tasks -> no gaps proposed at all.
        let gap_id = format!("gap:{project_id}:theory");
        let err = gap_approve_proposal_impl(&state, &project_id, &gap_id).unwrap_err();
        assert!(
            err.developer_detail.contains("not found"),
            "no proposed gap: {err:?}"
        );
    }

    // -----------------------------------------------------------------
    // Research config (IPC batch 2, ADR-020)
    // -----------------------------------------------------------------

    /// A valid config input payload; the closure parameters vary the parts
    /// under test.
    fn config_input(
        purpose: &str,
        depth: i64,
        update_frequency: &str,
        time_range: TimeRangeInput,
    ) -> ResearchConfigInput {
        ResearchConfigInput {
            domain: "AI".into(),
            topic: "LLM scaling".into(),
            purpose: purpose.into(),
            audience: String::new(),
            depth,
            dimensions: vec!["theory".into()],
            time_range,
            geographic_scope: String::new(),
            languages: vec!["en".into()],
            source_types: vec!["web".into()],
            source_domains: Vec::new(),
            update_frequency: update_frequency.into(),
        }
    }

    #[test]
    fn research_config_get_returns_the_current_generation() {
        let state = test_state();
        let project_id = seeded_project(&state);

        let config = research_config_get_impl(&state, &project_id).unwrap();
        assert_eq!(config.project_id, project_id);
        assert_eq!(config.schema_version, "1.0");
        assert_eq!(config.domain, "AI");
        assert_eq!(config.topic, "LLM scaling");
        assert_eq!(config.purpose, "learning", "default_config_input default");
        assert_eq!(config.depth, 2);
        assert_eq!(config.dimensions, vec!["theory".to_string()]);
        // Unbounded reads as the object form, never bare null (frontend
        // timeRangeSchema requires {from, to}).
        assert_eq!(config.time_range.from, None);
        assert_eq!(config.time_range.to, None);
        assert_eq!(config.update_frequency, "manual");
        assert!(!config.config_id.is_empty());
        assert!(config.created_at.ends_with('Z'), "{}", config.created_at);

        let err = research_config_get_impl(&state, "ghost").unwrap_err();
        assert!(err.developer_detail.contains("not found"));
    }

    #[test]
    fn research_config_put_appends_a_generation_the_read_side_resolves() {
        let state = test_state();
        let project_id = seeded_project(&state);
        let before = research_config_get_impl(&state, &project_id).unwrap();

        let updated = research_config_put_impl(
            &state,
            ResearchConfigPutRequest {
                project_id: project_id.clone(),
                config: ResearchConfigInput {
                    topic: "LLM interpretability".into(),
                    purpose: "research".into(),
                    audience: "researchers".into(),
                    depth: 4,
                    dimensions: vec!["theory".into(), "safety".into()],
                    time_range: TimeRangeInput {
                        from: Some("2023-01-01T00:00:00.000Z".into()),
                        to: Some("2026-06-01T00:00:00Z".into()),
                    },
                    geographic_scope: "global".into(),
                    languages: vec!["en".into(), "zh".into()],
                    source_types: vec!["paper".into(), "web".into()],
                    source_domains: vec!["arxiv.org".into()],
                    ..config_input("research", 4, "manual", TimeRangeInput::default())
                },
            },
        )
        .unwrap();

        // A new generation, not an in-place edit of the first row.
        assert_ne!(updated.config_id, before.config_id);
        assert_eq!(updated.topic, "LLM interpretability");
        assert_eq!(updated.depth, 4);
        assert_eq!(
            updated.time_range.from.as_deref(),
            Some("2023-01-01T00:00:00.000Z")
        );
        assert_eq!(
            updated.time_range.to.as_deref(),
            Some("2026-06-01T00:00:00.000Z")
        );
        assert_eq!(updated.languages, vec!["en".to_string(), "zh".to_string()]);

        // Reads resolve the latest generation; both rows persist.
        assert_eq!(
            research_config_get_impl(&state, &project_id).unwrap(),
            updated
        );
        {
            let conn = state.conn.lock().expect("database mutex poisoned");
            let rows = ResearchConfigs::list_for_project(&conn, &project_id).unwrap();
            assert_eq!(rows.len(), 2);
            assert_eq!(rows[0].id, before.config_id, "ordered oldest first");
            assert_eq!(rows[1].id, updated.config_id);
            assert_eq!(rows[1].time_range_from, Some(1_672_531_200_000));
            assert_eq!(rows[1].purpose, "research");
        }

        // Later plan generations build from the new configuration.
        let plan = plan_regenerate_impl(&state, &project_id).unwrap();
        assert!(
            plan.title.contains("LLM interpretability"),
            "{}",
            plan.title
        );
    }

    #[test]
    fn research_config_put_rejects_invalid_values_without_persisting() {
        let state = test_state();
        let project_id = seeded_project(&state);

        let cases: Vec<(&str, ResearchConfigInput)> = vec![
            (
                "purpose",
                config_input("vibing", 2, "manual", TimeRangeInput::default()),
            ),
            (
                "depth",
                config_input("learning", 0, "manual", TimeRangeInput::default()),
            ),
            (
                "depth",
                config_input("learning", 6, "manual", TimeRangeInput::default()),
            ),
            (
                "update_frequency",
                config_input("learning", 2, "daily", TimeRangeInput::default()),
            ),
            (
                "ISO-8601",
                config_input(
                    "learning",
                    2,
                    "manual",
                    TimeRangeInput {
                        from: Some("yesterday-ish".into()),
                        to: None,
                    },
                ),
            ),
        ];
        for (needle, config) in cases {
            let err = research_config_put_impl(
                &state,
                ResearchConfigPutRequest {
                    project_id: project_id.clone(),
                    config,
                },
            )
            .unwrap_err();
            assert!(
                err.developer_detail.contains(needle),
                "expected '{needle}' in {err:?}"
            );
        }

        // Unknown projects fail too; nothing above persisted a row.
        let err = research_config_put_impl(
            &state,
            ResearchConfigPutRequest {
                project_id: "ghost".into(),
                config: config_input("learning", 2, "manual", TimeRangeInput::default()),
            },
        )
        .unwrap_err();
        assert!(err.developer_detail.contains("not found"));
        let conn = state.conn.lock().expect("database mutex poisoned");
        assert_eq!(
            ResearchConfigs::list_for_project(&conn, &project_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn research_config_put_request_parses_the_frontend_payload_shape() {
        // The frontend sends the full ResearchConfig object (including
        // schema_version, config_id echoes) inside ConfigUpdateRequest.
        let payload = json!({
            "project_id": "p1",
            "config": {
                "schema_version": "1.0",
                "config_id": "ignored-echo",
                "project_id": "p1",
                "domain": "AI",
                "topic": "LLM scaling",
                "purpose": "learning",
                "audience": "",
                "depth": 2,
                "dimensions": ["theory"],
                "time_range": {"from": null, "to": null},
                "geographic_scope": "",
                "languages": ["en"],
                "source_types": ["web"],
                "source_domains": [],
                "update_frequency": "manual"
            }
        });
        let parsed: ResearchConfigPutRequest = serde_json::from_value(payload).unwrap();
        assert_eq!(parsed.project_id, "p1");
        assert_eq!(parsed.config.purpose, "learning");
        assert_eq!(parsed.config.time_range.from, None);
        assert_eq!(parsed.config.dimensions, vec!["theory".to_string()]);
    }
}
