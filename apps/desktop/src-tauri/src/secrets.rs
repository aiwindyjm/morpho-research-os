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
use std::sync::Mutex;

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

/// Storage port for secret values. Production uses the OS keychain adapter;
/// tests use [`FakeKeychain`]. Implementations must never log values.
pub trait SecretStore: Send + Sync {
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

/// Application configuration: provider list plus worker entrypoint. This is
/// internal Rust-core state persisted as a file under the app config
/// directory; it crosses no IPC boundary and contains no secret values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub providers: Vec<ProviderConfig>,
    pub worker_entrypoint: Option<String>,
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
}
