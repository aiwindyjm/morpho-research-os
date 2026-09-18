//! Secrets and provider configuration boundary.
//!
//! Invariants (AGENTS.md, docs/api/PROVIDERS.md, RUST-04):
//! * SQLite, config files, logs, events, and IPC payloads carry only
//!   [`SecretRef`] references — never secret values;
//! * secret values live exclusively behind the [`SecretStore`] port; the
//!   production adapter is the OS secure storage, tests use
//!   [`FakeKeychain`];
//! * `docs/api/ERRORS.md` has no keychain-specific code yet, so failures map
//!   onto `PROVIDER_AUTH_FAILED` with distinct details and a retryable flag;
//!   adding dedicated codes is a contract proposal for workgroup A.

use crate::error::{CoreError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// A reference to a secret stored in the OS secure storage. Its `Display`
/// (and therefore every log, error, or event that includes it) only ever
/// contains the reference path, never a value.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SecretRef {
    pub provider: String,
    pub key_name: String,
}

impl SecretRef {
    pub fn new(provider: impl Into<String>, key_name: impl Into<String>) -> Self {
        Self {
            provider: provider.into(),
            key_name: key_name.into(),
        }
    }
}

impl std::fmt::Display for SecretRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "keychain://morpho/{}/{}", self.provider, self.key_name)
    }
}

/// Storage port for secret values. Production uses the OS keychain adapter
/// ([`KeychainSecretStore`]); tests use [`FakeKeychain`] or keyring's mock
/// credential builder. Implementations must never log values. The `Debug`
/// bound exists so state holders can be debug-formatted safely: every
/// implementation's `Debug` output must hide values.
pub trait SecretStore: Send + Sync + std::fmt::Debug {
    /// Stores a value under a reference.
    fn set(&self, reference: &SecretRef, value: &str) -> Result<(), CoreError>;
    /// Reads a value. `Ok(None)` means the reference is not set.
    fn get(&self, reference: &SecretRef) -> Result<Option<String>, CoreError>;
    /// Deletes a value if present.
    fn delete(&self, reference: &SecretRef) -> Result<(), CoreError>;
}

/// Failure modes a keychain backend distinguishes.
enum KeychainFailure {
    /// Reference known but value absent.
    NotFound,
    /// The OS denied access to the secure storage.
    AccessDenied,
    /// The backend is temporarily unavailable (retryable).
    BackendUnavailable,
}

fn keychain_error(reference: &SecretRef, failure: KeychainFailure) -> CoreError {
    match failure {
        KeychainFailure::NotFound => CoreError::new(
            ErrorCode::ProviderAuthFailed,
            "A required provider credential is not configured.",
            format!("secret not found: {reference}"),
            false,
        ),
        KeychainFailure::AccessDenied => CoreError::new(
            ErrorCode::ProviderAuthFailed,
            "Access to the secure credential storage was denied.",
            format!("keychain access denied for: {reference}"),
            false,
        ),
        KeychainFailure::BackendUnavailable => CoreError::new(
            ErrorCode::ProviderAuthFailed,
            "The secure credential storage is temporarily unavailable.",
            format!("keychain unavailable for: {reference}"),
            true,
        ),
    }
}

/// In-memory [`SecretStore`] for tests and offline runs. Its `Debug` output
/// deliberately shows only counts, never values.
pub struct FakeKeychain {
    entries: Mutex<HashMap<String, String>>,
    /// When set, every operation fails with this simulated failure.
    pub fail_with: Mutex<Option<FakeKeychainFailure>>,
}

/// Selectable failure injection for [`FakeKeychain`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FakeKeychainFailure {
    AccessDenied,
    BackendUnavailable,
}

impl Default for FakeKeychain {
    fn default() -> Self {
        Self::new()
    }
}

impl FakeKeychain {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            fail_with: Mutex::new(None),
        }
    }

    pub fn set_failure(&self, failure: Option<FakeKeychainFailure>) {
        *self.fail_with.lock().expect("keychain mutex poisoned") = failure;
    }

    fn check_failure(&self, reference: &SecretRef) -> Option<CoreError> {
        match *self.fail_with.lock().expect("keychain mutex poisoned") {
            Some(FakeKeychainFailure::AccessDenied) => {
                Some(keychain_error(reference, KeychainFailure::AccessDenied))
            }
            Some(FakeKeychainFailure::BackendUnavailable) => Some(keychain_error(
                reference,
                KeychainFailure::BackendUnavailable,
            )),
            None => None,
        }
    }

    fn key(reference: &SecretRef) -> String {
        reference.to_string()
    }
}

impl std::fmt::Debug for FakeKeychain {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.entries.lock().expect("keychain mutex poisoned").len();
        write!(f, "FakeKeychain({count} entries, values hidden)")
    }
}

impl SecretStore for FakeKeychain {
    fn set(&self, reference: &SecretRef, value: &str) -> Result<(), CoreError> {
        if let Some(err) = self.check_failure(reference) {
            return Err(err);
        }
        self.entries
            .lock()
            .expect("keychain mutex poisoned")
            .insert(Self::key(reference), value.to_string());
        Ok(())
    }

    fn get(&self, reference: &SecretRef) -> Result<Option<String>, CoreError> {
        if let Some(err) = self.check_failure(reference) {
            return Err(err);
        }
        Ok(self
            .entries
            .lock()
            .expect("keychain mutex poisoned")
            .get(&Self::key(reference))
            .cloned())
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), CoreError> {
        if let Some(err) = self.check_failure(reference) {
            return Err(err);
        }
        self.entries
            .lock()
            .expect("keychain mutex poisoned")
            .remove(&Self::key(reference));
        Ok(())
    }
}

/// Production [`SecretStore`] over the real OS secure storage via the
/// `keyring` crate: Windows Credential Manager, macOS Keychain, or the Linux
/// keyutils/Secret Service pair (feature-selected per target).
///
/// Entries are addressed as (service = `dev.morpho.researchos`,
/// account = `<provider>/<key_name>`). Entry handles are created lazily and
/// cached: for the real OS stores an [`keyring::Entry`] is a plain stateless
/// handle, and for keyring's `EntryOnly` mock credential (used by unit tests)
/// caching is what makes values observable across operations. Secret values
/// never enter any error path, log line, or `Debug` output.
pub struct KeychainSecretStore {
    service: String,
    entries: Mutex<HashMap<String, keyring::Entry>>,
}

impl KeychainSecretStore {
    /// Service name every Morpho credential is stored under.
    pub const DEFAULT_SERVICE: &'static str = "dev.morpho.researchos";

    pub fn new() -> Self {
        Self::with_service(Self::DEFAULT_SERVICE)
    }

    /// Store bound to an explicit service name (used to isolate tests).
    pub fn with_service(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn service(&self) -> &str {
        &self.service
    }

    /// The OS keychain account name for a reference.
    fn account(reference: &SecretRef) -> String {
        format!("{}/{}", reference.provider, reference.key_name)
    }

    /// Runs one operation against the cached entry handle for a reference,
    /// creating the handle on first use.
    fn with_entry<T>(
        &self,
        reference: &SecretRef,
        op: impl FnOnce(&keyring::Entry) -> std::result::Result<T, keyring::Error>,
    ) -> std::result::Result<T, keyring::Error> {
        let key = reference.to_string();
        let mut cache = self.entries.lock().expect("keychain mutex poisoned");
        if !cache.contains_key(&key) {
            let entry = keyring::Entry::new(&self.service, &Self::account(reference))?;
            cache.insert(key.clone(), entry);
        }
        let entry = cache.get(&key).expect("entry inserted above");
        op(entry)
    }
}

impl Default for KeychainSecretStore {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for KeychainSecretStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never formats entries: keyring's mock credential Debug output
        // contains the stored bytes, and real stores may expose metadata.
        let count = self.entries.lock().expect("keychain mutex poisoned").len();
        write!(
            f,
            "KeychainSecretStore(service={}, {count} entries, values hidden)",
            self.service
        )
    }
}

/// Maps a keyring failure onto the shared failure model. The returned tag is
/// a static variant description only: keyring payloads are deliberately not
/// stringified (`BadEncoding` in particular carries the raw stored bytes,
/// which may be the secret itself).
fn classify_keyring_error(err: &keyring::Error) -> (KeychainFailure, &'static str) {
    match err {
        keyring::Error::NoEntry => (KeychainFailure::NotFound, "no entry in keychain"),
        keyring::Error::NoStorageAccess(_) => (
            KeychainFailure::BackendUnavailable,
            "secure storage inaccessible",
        ),
        keyring::Error::PlatformFailure(_) => {
            (KeychainFailure::AccessDenied, "platform storage failure")
        }
        keyring::Error::Ambiguous(_) => (KeychainFailure::AccessDenied, "ambiguous credential"),
        keyring::Error::BadEncoding(_) => (
            KeychainFailure::AccessDenied,
            "stored value is not valid UTF-8",
        ),
        keyring::Error::TooLong(_, _) => (KeychainFailure::AccessDenied, "attribute too long"),
        keyring::Error::Invalid(_, _) => (KeychainFailure::AccessDenied, "invalid attribute"),
        // The enum is non-exhaustive upstream; unknown failures are treated
        // as access problems rather than retryable unavailability.
        _ => (
            KeychainFailure::AccessDenied,
            "unclassified keyring failure",
        ),
    }
}

fn keychain_backend_error(reference: &SecretRef, err: &keyring::Error) -> CoreError {
    let (failure, tag) = classify_keyring_error(err);
    let mut error = keychain_error(reference, failure);
    error.developer_detail.push_str(&format!(" ({tag})"));
    error
}

impl SecretStore for KeychainSecretStore {
    fn set(&self, reference: &SecretRef, value: &str) -> Result<(), CoreError> {
        self.with_entry(reference, |entry| entry.set_password(value))
            .map_err(|err| keychain_backend_error(reference, &err))
    }

    fn get(&self, reference: &SecretRef) -> Result<Option<String>, CoreError> {
        match self.with_entry(reference, |entry| entry.get_password()) {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(keychain_backend_error(reference, &err)),
        }
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), CoreError> {
        match self.with_entry(reference, |entry| entry.delete_credential()) {
            Ok(()) => Ok(()),
            // Deleting a reference that is not set is fine, mirroring
            // FakeKeychain's contract.
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(keychain_backend_error(reference, &err)),
        }
    }
}

/// Constructs the process-wide secret store from the app configuration
/// (PRD §11: keys live in the OS keychain; `fake` keeps CI hermetic).
///
/// Backend selection is explicit: `"keychain"` routes through the real OS
/// secure storage, `"fake"` (the default when the `secrets` section is
/// absent) uses the in-memory [`FakeKeychain`], and anything else is a
/// configuration error — never a silent fallback. This is the constructor
/// `state.rs`/`commands.rs` wire into the app state in place of
/// `production_keychain()`.
pub fn build_secret_store(config: &AppConfig) -> Result<Arc<dyn SecretStore>, CoreError> {
    config.secrets.validate()?;
    if config.secrets.is_keychain() {
        Ok(Arc::new(KeychainSecretStore::new()))
    } else {
        Ok(Arc::new(FakeKeychain::new()))
    }
}

/// Provider configuration. Field set mirrors the planned W2-03 provider
/// contract (base URL, key reference, model, timeout, retry); crucially it
/// holds a [`SecretRef`], never a value.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub api_key_ref: SecretRef,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

impl ProviderConfig {
    /// Resolves the API key for direct use inside the Rust core only. The
    /// returned value must never be serialized, logged, or sent to the UI.
    pub fn resolve_api_key(&self, store: &dyn SecretStore) -> Result<String, CoreError> {
        match store.get(&self.api_key_ref)? {
            Some(value) => Ok(value),
            None => Err(keychain_error(&self.api_key_ref, KeychainFailure::NotFound)),
        }
    }
}

/// Worker launch configuration (the `worker` section of [`AppConfig`]).
///
/// `transport` selects which [`crate::worker::WorkerTransport`] the
/// supervisor uses: `"fake"` (default; hermetic, no process) or `"http"`
/// (spawns the Python worker and speaks the loopback HTTP protocol). The
/// remaining fields describe the launch command for the HTTP transport.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WorkerConfig {
    /// `"fake"` or `"http"`.
    pub transport: String,
    /// Python executable used to launch `morpho_worker.serve`.
    pub python_executable: String,
    /// Module arguments appended to the executable
    /// (default `["-m", "morpho_worker.serve"]`).
    pub module_args: Vec<String>,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            transport: "fake".into(),
            python_executable: "python".into(),
            module_args: vec!["-m".into(), "morpho_worker.serve".into()],
        }
    }
}

impl WorkerConfig {
    pub fn is_http(&self) -> bool {
        self.transport == "http"
    }

    /// Validates the transport selector; anything but `"fake"`/`"http"` is a
    /// configuration error, not a silent fallback.
    pub fn validate(&self) -> Result<(), CoreError> {
        if matches!(self.transport.as_str(), "fake" | "http") {
            Ok(())
        } else {
            Err(CoreError::database(format!(
                "unknown worker transport '{}' (expected \"fake\" or \"http\")",
                self.transport
            )))
        }
    }
}

/// Secrets backend selection (the `secrets` section of [`AppConfig`]).
///
/// `backend` picks the compiled [`SecretStore`] adapter: `"keychain"` (the
/// real OS secure storage via [`KeychainSecretStore`]) or `"fake"` (the
/// hermetic in-memory [`FakeKeychain`], the default so CI and offline runs
/// never touch a real keychain).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SecretsConfig {
    /// `"keychain"` or `"fake"`.
    pub backend: String,
}

impl Default for SecretsConfig {
    fn default() -> Self {
        Self {
            backend: "fake".into(),
        }
    }
}

impl SecretsConfig {
    pub fn is_keychain(&self) -> bool {
        self.backend == "keychain"
    }

    /// Validates the backend selector; anything but `"keychain"`/`"fake"` is
    /// a configuration error, not a silent fallback.
    pub fn validate(&self) -> Result<(), CoreError> {
        if matches!(self.backend.as_str(), "keychain" | "fake") {
            Ok(())
        } else {
            Err(CoreError::database(format!(
                "unknown secrets backend '{}' (expected \"keychain\" or \"fake\")",
                self.backend
            )))
        }
    }
}

/// Application configuration: provider list plus worker entrypoint. This is
/// internal Rust-core state persisted as a file under the app config
/// directory; it crosses no IPC boundary and contains no secret values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub providers: Vec<ProviderConfig>,
    pub worker_entrypoint: Option<String>,
    /// Worker transport/launch settings; absent in older config files means
    /// the hermetic fake transport.
    #[serde(default)]
    pub worker: WorkerConfig,
    /// Secrets backend selection; absent in older config files means the
    /// hermetic fake keychain.
    #[serde(default)]
    pub secrets: SecretsConfig,
}

impl AppConfig {
    pub fn provider(&self, name: &str) -> Option<&ProviderConfig> {
        self.providers.iter().find(|p| p.name == name)
    }

    /// Serializes the config for export; the result provably contains no
    /// secret values because none are representable in [`AppConfig`].
    pub fn to_json(&self) -> Result<String, CoreError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| CoreError::database(format!("serialize app config failed: {e}")))
    }

    pub fn from_json(raw: &str) -> Result<Self, CoreError> {
        serde_json::from_str(raw)
            .map_err(|e| CoreError::database(format!("parse app config failed: {e}")))
    }
}

/// Builds the worker process's provider-configuration environment (review F)
/// from the desktop's provider list: the documented draft env contract
/// (`MORPHO_PROVIDER_<NAME>_{KIND,BASE_URL,MODEL,KEY_REF,PROTOCOL,TIMEOUT,
/// RETRIES}`, `MORPHO_ROLE_<ROLE>`) that `morpho_worker.config.from_env`
/// parses on the worker side.
///
/// API-key VALUES resolve from the secret store here, at spawn time, and
/// travel ONLY through the child process's environment variables — never
/// config files, job payloads, logs, or IPC. A configured provider whose key
/// is missing is a structured non-retryable auth error: the worker must
/// never silently fall back to offline mocks (audit F3).
///
/// An empty provider list yields an empty environment: the worker's own
/// safe default (fully unconfigured ⇒ offline mock) applies, which is the
/// correct behavior for a fresh install with no providers set up.
pub fn worker_provider_env(
    config: &AppConfig,
    store: &dyn SecretStore,
) -> Result<Vec<(String, String)>, CoreError> {
    // Role routing (round-2 review P1): with EXACTLY ONE provider the
    // routing is unambiguous — every worker LLM role (planner, validation,
    // extraction, summarization, classification) routes to it explicitly,
    // so the worker never silently falls back to its built-in defaults.
    // With more than one provider the desktop config cannot yet express
    // intent (the role/kind/protocol model is pending ADR-025), and
    // silently picking the first provider is forbidden — the handoff
    // refuses loudly instead.
    if config.providers.len() > 1 {
        let names = config
            .providers
            .iter()
            .map(|provider| provider.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(CoreError::new(
            ErrorCode::ProviderAuthFailed,
            "配置了多个 Provider，但桌面端尚未支持按角色路由（ADR-025 待批）。请只保留一个              Provider，或等待角色路由配置获批。",
            format!(
                "multiple providers configured ({names}) without role routing — the desktop                  provider model has no kind/protocol/role fields yet (ADR-025, Proposed);                  refusing to guess. Configure exactly one provider or ratify ADR-025"
            ),
            false,
        ));
    }
    let mut env = Vec::new();
    for provider in &config.providers {
        let segment = provider.name.replace('-', "_").to_uppercase();
        let value_var = format!("MORPHO_KEY_{segment}");
        let key_ref = format!("env:{value_var}");
        env.push((format!("MORPHO_PROVIDER_{segment}_KIND"), "llm".to_string()));
        env.push((
            format!("MORPHO_PROVIDER_{segment}_BASE_URL"),
            provider.base_url.clone(),
        ));
        env.push((
            format!("MORPHO_PROVIDER_{segment}_MODEL"),
            provider.model.clone(),
        ));
        env.push((format!("MORPHO_PROVIDER_{segment}_KEY_REF"), key_ref));
        env.push((
            format!("MORPHO_PROVIDER_{segment}_PROTOCOL"),
            "openai".to_string(),
        ));
        env.push((
            format!("MORPHO_PROVIDER_{segment}_TIMEOUT"),
            (provider.timeout_ms / 1000).max(1).to_string(),
        ));
        env.push((
            format!("MORPHO_PROVIDER_{segment}_RETRIES"),
            provider.max_retries.to_string(),
        ));
        // Resolve the key value for the child process environment. Failure
        // surfaces as the structured auth error from the store — never a
        // silent mock fallback.
        let value = provider.resolve_api_key(store)?;
        env.push((value_var, value));
    }
    if let Some(only) = config.providers.first() {
        for role in [
            "PLANNER",
            "VALIDATION",
            "EXTRACTION",
            "SUMMARIZATION",
            "CLASSIFICATION",
        ] {
            env.push((format!("MORPHO_ROLE_{role}"), only.name.clone()));
        }
        // The EMBEDDING role deliberately stays on the worker's own default
        // (the reserved mock id): the desktop provider model is LLM-only in
        // V0.1, and routing an embedding role onto a chat endpoint would
        // misexecute. ADR-025 proposes the explicit kind model.
    }
    Ok(env)
}

/// Loads and saves [`AppConfig`] as a single file using atomic replace.
pub struct FileConfigStore {
    path: PathBuf,
}

impl FileConfigStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> Result<AppConfig, CoreError> {
        match std::fs::read_to_string(&self.path) {
            Ok(raw) => AppConfig::from_json(&raw),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
            Err(err) => Err(CoreError::database(format!(
                "read config {} failed: {err}",
                self.path.display()
            ))),
        }
    }

    pub fn save(&self, config: &AppConfig) -> Result<(), CoreError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| {
                CoreError::database(format!(
                    "create config dir {} failed: {err}",
                    parent.display()
                ))
            })?;
        }
        let raw = config.to_json()?;
        let tmp = self.path.with_extension("tmp-new");
        std::fs::write(&tmp, raw)
            .map_err(|err| CoreError::database(format!("write config tmp failed: {err}")))?;
        std::fs::rename(&tmp, &self.path).map_err(|err| {
            let _ = std::fs::remove_file(&tmp);
            CoreError::database(format!("replace config failed: {err}"))
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_value() -> String {
        "v".repeat(24)
    }

    #[test]
    fn secret_refs_display_as_paths_only() {
        let reference = SecretRef::new("openai", "api_key");
        assert_eq!(reference.to_string(), "keychain://morpho/openai/api_key");
    }

    #[test]
    fn fake_keychain_set_get_delete_round_trip() {
        let store = FakeKeychain::new();
        let reference = SecretRef::new("glm", "api_key");
        assert_eq!(store.get(&reference).unwrap(), None);

        store.set(&reference, &test_value()).unwrap();
        assert_eq!(
            store.get(&reference).unwrap().as_deref(),
            Some(test_value().as_str())
        );

        store.delete(&reference).unwrap();
        assert_eq!(store.get(&reference).unwrap(), None);
        store.delete(&reference).unwrap(); // deleting a missing ref is fine
    }

    #[test]
    fn missing_key_maps_to_non_retryable_auth_error() {
        let store = FakeKeychain::new();
        let config = ProviderConfig {
            name: "openai".into(),
            base_url: "https://api.example.com".into(),
            model: "gpt-test".into(),
            api_key_ref: SecretRef::new("openai", "api_key"),
            timeout_ms: 30_000,
            max_retries: 2,
        };
        let err = config.resolve_api_key(&store).unwrap_err();
        assert_eq!(err.code, ErrorCode::ProviderAuthFailed);
        assert!(!err.retryable);
        assert!(err
            .developer_detail
            .contains("keychain://morpho/openai/api_key"));
    }

    #[test]
    fn access_denied_and_backend_unavailable_are_distinguishable() {
        let store = FakeKeychain::new();
        let reference = SecretRef::new("glm", "api_key");

        store.set_failure(Some(FakeKeychainFailure::AccessDenied));
        let denied = store.get(&reference).unwrap_err();
        assert_eq!(denied.code, ErrorCode::ProviderAuthFailed);
        assert!(!denied.retryable);
        assert!(denied.developer_detail.contains("denied"));

        store.set_failure(Some(FakeKeychainFailure::BackendUnavailable));
        let unavailable = store.get(&reference).unwrap_err();
        assert_eq!(unavailable.code, ErrorCode::ProviderAuthFailed);
        assert!(unavailable.retryable);
        assert!(unavailable.developer_detail.contains("unavailable"));
    }

    #[test]
    fn no_key_value_ever_appears_in_errors_or_debug() {
        let store = FakeKeychain::new();
        let reference = SecretRef::new("openai", "api_key");
        let value = test_value();
        store.set(&reference, &value).unwrap();

        store.set_failure(Some(FakeKeychainFailure::BackendUnavailable));
        let err = store.get(&reference).unwrap_err();
        let debug_text = format!("{err:?} {store:?}");
        assert!(
            !debug_text.contains(&value),
            "secret leaked via debug output"
        );
    }

    #[test]
    fn config_export_contains_references_but_no_values() {
        let value = test_value();
        let keychain = FakeKeychain::new();
        let reference = SecretRef::new("openai", "api_key");
        keychain.set(&reference, &value).unwrap();

        let config = AppConfig {
            providers: vec![ProviderConfig {
                name: "openai".into(),
                base_url: "https://api.example.com".into(),
                model: "gpt-test".into(),
                api_key_ref: reference,
                timeout_ms: 30_000,
                max_retries: 2,
            }],
            worker_entrypoint: None,
            worker: WorkerConfig::default(),
            secrets: SecretsConfig::default(),
        };
        let exported = config.to_json().unwrap();
        // The reference is present as structured fields; the value is absent.
        assert!(exported.contains("api_key_ref"));
        assert!(exported.contains("\"openai\""));
        assert!(
            !exported.contains(&value),
            "secret value leaked into export"
        );
    }

    #[test]
    fn config_file_round_trip_is_atomic() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileConfigStore::new(dir.path().join("config").join("app.json"));
        let config = AppConfig::default();
        store.save(&config).unwrap();
        assert_eq!(store.load().unwrap(), config);

        let mut config = config;
        config.providers.push(ProviderConfig {
            name: "ollama".into(),
            base_url: "http://127.0.0.1:11434".into(),
            model: "qwen-test".into(),
            api_key_ref: SecretRef::new("ollama", "api_key"),
            timeout_ms: 60_000,
            max_retries: 1,
        });
        store.save(&config).unwrap();
        assert_eq!(store.load().unwrap(), config);
        assert!(config.provider("ollama").is_some());
        assert!(config.provider("missing").is_none());
    }

    #[test]
    fn loading_a_missing_config_yields_default() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileConfigStore::new(dir.path().join("absent.json"));
        assert_eq!(store.load().unwrap(), AppConfig::default());
    }

    #[test]
    fn worker_section_defaults_and_back_compatibility() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy.json");
        // A pre-worker-section config file loads with the hermetic default.
        std::fs::write(&path, r#"{"providers": [], "worker_entrypoint": null}"#).unwrap();
        let loaded = FileConfigStore::new(&path).load().unwrap();
        assert_eq!(loaded.worker, WorkerConfig::default());
        assert!(!loaded.worker.is_http());

        // Round trip keeps the selector.
        let mut config = loaded;
        config.worker.transport = "http".into();
        config.worker.python_executable = "py".into();
        let store = FileConfigStore::new(&path);
        store.save(&config).unwrap();
        assert_eq!(store.load().unwrap(), config);
        assert!(config.worker.is_http());

        // Unknown selectors are rejected, not silently coerced.
        let mut bad = config;
        bad.worker.transport = "grpc".into();
        assert!(bad.worker.validate().is_err());
        assert!(WorkerConfig::default().validate().is_ok());
    }

    /// Installs keyring's in-memory mock credential store for the current
    /// test. The call is global but idempotent: every mock-based test
    /// installs the same builder, so parallel test threads observe a stable
    /// store. Only the #[ignore]d manual test restores the platform builder.
    fn install_mock_keyring() {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }

    #[test]
    fn keychain_backend_round_trips_through_the_mock_credential_builder() {
        install_mock_keyring();
        let store = KeychainSecretStore::new();
        assert_eq!(store.service(), KeychainSecretStore::DEFAULT_SERVICE);

        let first = SecretRef::new("glm", "api_key");
        let second = SecretRef::new("openai", "api_key");
        assert_eq!(store.get(&first).unwrap(), None);
        assert_eq!(store.get(&second).unwrap(), None);

        store.set(&first, &test_value()).unwrap();
        store.set(&second, &test_value()).unwrap();
        assert_eq!(
            store.get(&first).unwrap().as_deref(),
            Some(test_value().as_str())
        );
        assert_eq!(
            store.get(&second).unwrap().as_deref(),
            Some(test_value().as_str())
        );

        store.delete(&first).unwrap();
        assert_eq!(store.get(&first).unwrap(), None);
        // References are isolated entries.
        assert_eq!(
            store.get(&second).unwrap().as_deref(),
            Some(test_value().as_str())
        );
        store.delete(&first).unwrap(); // deleting a missing ref is fine
    }

    #[test]
    fn keychain_backend_missing_key_maps_to_non_retryable_auth_error() {
        install_mock_keyring();
        let store = KeychainSecretStore::new();
        let config = ProviderConfig {
            name: "openai".into(),
            base_url: "https://api.example.com".into(),
            model: "gpt-test".into(),
            api_key_ref: SecretRef::new("openai", "api_key"),
            timeout_ms: 30_000,
            max_retries: 2,
        };
        let err = config.resolve_api_key(&store).unwrap_err();
        assert_eq!(err.code, ErrorCode::ProviderAuthFailed);
        assert!(!err.retryable);
        assert!(err
            .developer_detail
            .contains("keychain://morpho/openai/api_key"));
    }

    #[test]
    fn keychain_store_debug_never_exposes_values() {
        install_mock_keyring();
        let store = KeychainSecretStore::new();
        let reference = SecretRef::new("openai", "api_key");
        let value = test_value();
        store.set(&reference, &value).unwrap();

        let debug_text = format!("{store:?}");
        assert!(
            !debug_text.contains(&value),
            "secret leaked via debug output: {debug_text}"
        );
        assert!(debug_text.contains("values hidden"));
    }

    #[test]
    fn build_secret_store_selects_the_configured_backend() {
        // Default (and legacy configs without a secrets section): fake.
        let fake_config = AppConfig::default();
        assert!(!fake_config.secrets.is_keychain());
        let fake_store = build_secret_store(&fake_config).unwrap();
        assert!(format!("{fake_store:?}").contains("FakeKeychain"));

        // Explicit keychain selection builds the OS-keychain adapter; the
        // mock builder installed here keeps this hermetic.
        let mut keychain_config = fake_config.clone();
        keychain_config.secrets.backend = "keychain".into();
        install_mock_keyring();
        let keychain_store = build_secret_store(&keychain_config).unwrap();
        assert!(format!("{keychain_store:?}").contains("KeychainSecretStore"));

        // Unknown selectors are a configuration error, not a fallback.
        let mut bad = keychain_config;
        bad.secrets.backend = "env".into();
        let err = build_secret_store(&bad).unwrap_err();
        assert!(
            err.developer_detail.contains("unknown secrets backend"),
            "{err:?}"
        );
    }

    #[test]
    fn secrets_section_defaults_and_back_compatibility() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy-secrets.json");
        // A pre-secrets-section config file loads with the hermetic default.
        std::fs::write(&path, r#"{"providers": [], "worker_entrypoint": null}"#).unwrap();
        let loaded = FileConfigStore::new(&path).load().unwrap();
        assert_eq!(loaded.secrets, SecretsConfig::default());
        assert!(!loaded.secrets.is_keychain());

        // Round trip keeps the selector.
        let mut config = loaded;
        config.secrets.backend = "keychain".into();
        let store = FileConfigStore::new(&path);
        store.save(&config).unwrap();
        assert_eq!(store.load().unwrap(), config);
        assert!(config.secrets.is_keychain());

        // Unknown selectors are rejected, not silently coerced.
        let mut bad = config;
        bad.secrets.backend = "wincred".into();
        assert!(bad.secrets.validate().is_err());
        assert!(SecretsConfig::default().validate().is_ok());
    }

    #[test]
    #[ignore = "touches the real OS keychain; run manually with `cargo test -q -- --ignored` (alone, so the platform builder is not raced by mock-based tests)"]
    fn real_os_keychain_manual_round_trip() {
        // Restore the platform credential builder (mock-based unit tests
        // replace it globally) and exercise the real adapter end to end.
        keyring::set_default_credential_builder(keyring::default::default_credential_builder());
        let store = KeychainSecretStore::new();
        let reference = SecretRef::new("morpho-selftest", "roundtrip");
        // Runtime-generated throwaway value; never a real credential.
        let value = format!("morpho-keychain-selftest-{}", uuid::Uuid::new_v4());

        store.set(&reference, &value).unwrap();
        assert_eq!(
            store.get(&reference).unwrap().as_deref(),
            Some(value.as_str())
        );
        let _ = store.delete(&reference);
        assert_eq!(store.get(&reference).unwrap(), None);
    }

    // ------------------------------------------------------------------
    // Worker provider-environment handoff (review F)
    // ------------------------------------------------------------------

    fn provider(name: &str, key_name: &str) -> ProviderConfig {
        ProviderConfig {
            name: name.into(),
            base_url: "https://api.example.test/v1".into(),
            model: "model-test".into(),
            api_key_ref: SecretRef::new(name, key_name),
            timeout_ms: 45_000,
            max_retries: 2,
        }
    }

    /// The desktop Settings/keychain path: provider configuration AND the
    /// resolved key value reach the worker through its documented env
    /// contract; a configured worker is never flagged offline.
    #[test]
    fn worker_env_carries_provider_config_and_resolved_keys() {
        let store = FakeKeychain::new();
        store
            .set(&SecretRef::new("glm", "api_key"), &test_value())
            .unwrap();
        let config = AppConfig {
            providers: vec![provider("glm", "api_key")],
            ..Default::default()
        };
        let env = worker_provider_env(&config, &store).unwrap();
        let get = |name: &str| {
            env.iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
                .unwrap_or_else(|| panic!("missing env var {name}"))
        };
        assert_eq!(get("MORPHO_PROVIDER_GLM_KIND"), "llm");
        assert_eq!(
            get("MORPHO_PROVIDER_GLM_BASE_URL"),
            "https://api.example.test/v1"
        );
        assert_eq!(get("MORPHO_PROVIDER_GLM_MODEL"), "model-test");
        assert_eq!(get("MORPHO_PROVIDER_GLM_KEY_REF"), "env:MORPHO_KEY_GLM");
        assert_eq!(get("MORPHO_PROVIDER_GLM_PROTOCOL"), "openai");
        assert_eq!(get("MORPHO_PROVIDER_GLM_TIMEOUT"), "45");
        assert_eq!(get("MORPHO_PROVIDER_GLM_RETRIES"), "2");
        assert_eq!(get("MORPHO_KEY_GLM"), test_value());
        assert!(
            !env.iter().any(|(key, _)| key == "MORPHO_WORKER_OFFLINE"),
            "a configured provider must never steer the worker into mock mode"
        );
        // Hyphenated ids map onto the underscore env spelling the worker
        // parses back into the hyphenated provider id.
        let store2 = FakeKeychain::new();
        store2
            .set(&SecretRef::new("my-openai", "api_key"), &test_value())
            .unwrap();
        let config2 = AppConfig {
            providers: vec![provider("my-openai", "api_key")],
            ..Default::default()
        };
        let env2 = worker_provider_env(&config2, &store2).unwrap();
        assert!(env2
            .iter()
            .any(|(key, _)| key == "MORPHO_PROVIDER_MY_OPENAI_BASE_URL"));
    }

    /// No providers configured ⇒ empty handoff: the worker's own safe
    /// offline default applies (fresh install behavior).
    #[test]
    fn worker_env_without_providers_stays_minimal() {
        let env = worker_provider_env(&AppConfig::default(), &FakeKeychain::new()).unwrap();
        assert!(env.is_empty());
    }

    /// A configured provider with a missing key is a structured auth error,
    /// not a silent mock fallback.
    #[test]
    fn worker_env_with_a_missing_key_is_a_structured_auth_error() {
        let store = FakeKeychain::new();
        let config = AppConfig {
            providers: vec![provider("glm", "api_key")],
            ..Default::default()
        };
        let err = worker_provider_env(&config, &store).unwrap_err();
        assert_eq!(err.code, ErrorCode::ProviderAuthFailed);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("secret not found"));
    }

    /// A failing keychain (access denied) surfaces as the auth error — the
    /// handoff never swallows backend failures.
    #[test]
    fn worker_env_surfaces_keychain_failures() {
        let store = FakeKeychain::new();
        store
            .set(&SecretRef::new("glm", "api_key"), &test_value())
            .unwrap();
        store.set_failure(Some(FakeKeychainFailure::AccessDenied));
        let config = AppConfig {
            providers: vec![provider("glm", "api_key")],
            ..Default::default()
        };
        let err = worker_provider_env(&config, &store).unwrap_err();
        assert_eq!(err.code, ErrorCode::ProviderAuthFailed);
    }

    /// Round-2 probe: with exactly ONE provider configured, the handoff
    /// routes every worker LLM role to it EXPLICITLY — the worker never
    /// silently falls back to its built-in defaults (glm/ollama-local).
    #[test]
    fn single_provider_handoff_routes_every_llm_role() {
        let store = FakeKeychain::new();
        store
            .set(&SecretRef::new("custom", "api_key"), &test_value())
            .unwrap();
        let config = AppConfig {
            providers: vec![ProviderConfig {
                name: "custom".into(),
                base_url: "https://provider.test/v1".into(),
                model: "model-x".into(),
                api_key_ref: SecretRef::new("custom", "api_key"),
                timeout_ms: 30_000,
                max_retries: 1,
            }],
            ..Default::default()
        };
        let env = worker_provider_env(&config, &store).unwrap();
        for role in [
            "PLANNER",
            "VALIDATION",
            "EXTRACTION",
            "SUMMARIZATION",
            "CLASSIFICATION",
        ] {
            assert!(
                env.iter().any(
                    |(name, value)| name == &format!("MORPHO_ROLE_{role}") && value == "custom"
                ),
                "desktop handoff does not route {role} to the configured provider"
            );
        }
        // The embedding role is NOT routed: the desktop provider model is
        // LLM-only in V0.1, and routing an embedding role onto a chat
        // endpoint would misexecute (ADR-025 proposes the kind model).
        assert!(
            !env.iter().any(|(name, _)| name == "MORPHO_ROLE_EMBEDDING"),
            "the embedding role stays on the worker's own default"
        );
    }

    /// Multiple providers without role routing refuse loudly (round-2
    /// review P1): silently picking the first provider is forbidden; the
    /// role/kind/protocol model is pending ADR-025.
    #[test]
    fn multiple_providers_without_role_routing_refuse_loudly() {
        let store = FakeKeychain::new();
        for name in ["alpha", "beta"] {
            store
                .set(&SecretRef::new(name, "api_key"), &test_value())
                .unwrap();
        }
        let config = AppConfig {
            providers: vec![provider("alpha", "api_key"), provider("beta", "api_key")],
            ..Default::default()
        };
        let err = worker_provider_env(&config, &store).unwrap_err();
        assert_eq!(err.code, ErrorCode::ProviderAuthFailed);
        assert!(
            err.developer_detail.contains("without role routing"),
            "{err:?}"
        );
        assert!(
            err.developer_detail.contains("ADR-025"),
            "the refusal names the pending decision: {err:?}"
        );
    }
}
