//! Typed Tauri command adapters.
//!
//! Every command returns the [`IpcResponse`] envelope from `docs/API.md` and
//! reports failures through the unified [`CoreError`] model. This module must
//! stay a thin adapter: business behavior lives in the service/repository
//! layers, never here. Each `#[tauri::command]` fn delegates to a private
//! `*_impl` function on [`AppState`] so the logic is unit-testable with an
//! in-memory database and the fake worker transport (no Tauri app needed).

use crate::coverage::CoverageReport;
use crate::error::CoreError;
use crate::ipc::{IpcRequest, IpcResponse};
use crate::repositories::claims::ClaimRecord;
use crate::repositories::configs::{NewResearchConfig, ResearchConfigRecord};
use crate::repositories::events::EventRecord;
use crate::repositories::knowledge::KnowledgeNodeRecord;
use crate::repositories::plans::{PlanRecord, TaskRecord};
use crate::repositories::projects::ProjectRecord;
use crate::repositories::relations::RelationRecord;
use crate::repositories::runs::RunRecord;
use crate::repositories::services::{ProjectService, VaultExportResult, VaultService};
use crate::repositories::sources::SourceRecord;
use crate::secrets::{AppConfig, FakeKeychain, FileConfigStore, SecretRef, WorkerConfig};
use crate::state::AppState;
use crate::versions::{
    APP_NAME, APP_VERSION, EVENT_ENVELOPE, IPC_SCHEMA_VERSION, WORKER_PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

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
    let store = FileConfigStore::new(&state.config_path);
    store.save(&config)?;
    store.load()
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
// Runs (worker jobs)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunStartRequest {
    pub plan_id: String,
    /// The caller's plan-review decision carried into the job envelope;
    /// without it the worker rejects the job (PLAN_NOT_APPROVED).
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

fn run_start_impl(state: &AppState, request: RunStartRequest) -> Result<RunStarted, CoreError> {
    // Phase 1 (database): resolve the plan's config and create the run.
    let (run, config_value) = {
        let mut conn = state.conn.lock().expect("database mutex poisoned");
        let plan = crate::repositories::plans::Plans::get(&conn, &request.plan_id)?
            .ok_or_else(|| CoreError::database(format!("plan '{}' not found", request.plan_id)))?;
        let config =
            crate::repositories::configs::ResearchConfigs::get(&conn, &plan.research_config_id)?
                .ok_or_else(|| {
                    CoreError::database(format!(
                        "research config '{}' not found",
                        plan.research_config_id
                    ))
                })?;
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
        (run, research_config_wire(&config))
    };

    // Phase 2 (worker): submit the research_run job with the approval
    // decision. Locks are taken sequentially, never nested.
    let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
    let ack = supervisor.submit_job(&crate::worker::JobRequest {
        job_id: crate::ids::new_id(),
        run_id: run.id.clone(),
        task_id: None,
        kind: "research_run".into(),
        params: config_value,
        approve_plan: request.approve_plan,
    })?;
    Ok(RunStarted {
        project_id: run.project_id,
        run_id: run.id,
        job_id: ack.job_id,
    })
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
    let mut supervisor = state.supervisor.lock().expect("supervisor mutex poisoned");
    supervisor.job_status(job_id)
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
    supervisor.cancel_job(job_id).map(|_| true)
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

/// Production default keychain (FakeKeychain until the OS-keychain task).
pub fn production_keychain() -> Arc<FakeKeychain> {
    Arc::new(FakeKeychain::new())
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
    use crate::secrets::ProviderConfig;
    use crate::worker::fake::{FakeClock, FakeSleeper, FakeWorkerScript};
    use crate::worker::{RestartPolicy, Supervisor};
    use serde_json::json;

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
                },
                sections: vec![],
                tasks: vec![NewTask {
                    title: "search theory".into(),
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
        assert_eq!(result.written, 1);
        assert!(state
            .vault_root
            .join(&project_id)
            .join("Concepts")
            .join("transformer.md")
            .exists());

        // Re-export of identical content is detected as unchanged.
        let again = vault_export_project_impl(&state, &project_id).unwrap();
        assert_eq!(again.unchanged, 1);
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
}
