//! Cross-language fixture envelope loader (Rust reference implementation).
//!
//! Validation rules are mirrored in `fixture-envelope.ts` and
//! `fixture_envelope.py`. A rule change must land in all three at once.
//! Envelope contract: tests/fixtures-support/schema/fixture-envelope.v1.json.
//! Payload validation is intentionally shallow (required + const at the top
//! level of the referenced canonical schema); deep validation belongs to the
//! schema toolchain, not to fixtures.

use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

pub const ENVELOPE_VERSION: &str = "1.0";

const TOP_LEVEL_KEYS: [&str; 8] = [
    "fixture_envelope_version",
    "fixture_id",
    "kind",
    "description",
    "input",
    "expected_outputs",
    "provenance",
    "stability",
];
const REQUIRED_TOP_LEVEL_KEYS: [&str; 5] = [
    "fixture_envelope_version",
    "fixture_id",
    "kind",
    "input",
    "provenance",
];
const INPUT_KEYS: [&str; 2] = ["schema", "payload"];
const OUTPUT_KEYS: [&str; 3] = ["name", "schema", "payload"];
const PROVENANCE_KEYS: [&str; 4] = ["origin", "synthetic", "license", "notes"];
const REQUIRED_PROVENANCE_KEYS: [&str; 2] = ["origin", "synthetic"];
const ORIGINS: [&str; 3] = ["synthetic", "curated-public", "user-contributed"];
const STABILITY_KEYS: [&str; 2] = ["deterministic", "ignored_fields"];

#[derive(Debug)]
pub struct EnvelopeError {
    pub rule: String,
    pub message: String,
}

impl fmt::Display for EnvelopeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.rule, self.message)
    }
}

impl std::error::Error for EnvelopeError {}

fn fail<T>(rule: &str, message: impl Into<String>) -> Result<T, EnvelopeError> {
    Err(EnvelopeError {
        rule: rule.to_string(),
        message: message.into(),
    })
}

/// Equivalent of `^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$`.
fn is_kebab_path_id(value: &str) -> bool {
    let valid_segment = |segment: &str| -> bool {
        !segment.is_empty()
            && !segment.starts_with('-')
            && !segment.ends_with('-')
            && segment
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    };
    !value.is_empty() && value.split('/').all(valid_segment)
}

/// Equivalent of `^[a-z][a-z0-9-]*$`.
fn is_snake_free_name(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
        _ => false,
    }
}

/// Locates the repository root by walking up ancestors to the directory
/// containing the VERSION marker.
pub fn repo_root() -> Result<PathBuf, EnvelopeError> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for ancestor in manifest_dir.ancestors() {
        if ancestor.join("VERSION").is_file() {
            return Ok(ancestor.to_path_buf());
        }
    }
    fail("config", "repository root not found: no VERSION marker above the crate")
}

/// Strips the `.json` extension and trailing `.vN` from a schema $id segment.
pub fn base_schema_name(schema_id: &str) -> String {
    let segment = schema_id.split('/').filter(|p| !p.is_empty()).last().unwrap_or("");
    let without_ext = segment.strip_suffix(".json").unwrap_or(segment);
    if let Some(index) = without_ext.rfind(".v") {
        let suffix = &without_ext[index + 2..];
        if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) {
            return without_ext[..index].to_string();
        }
    }
    without_ext.to_string()
}

pub type SchemaRegistry = BTreeMap<String, (PathBuf, Value)>;

pub fn load_schema_registry(schemas_dir: &Path) -> Result<SchemaRegistry, EnvelopeError> {
    let mut names: Vec<String> = fs::read_dir(schemas_dir)
        .and_then(|entries| {
            entries
                .map(|entry| entry.map(|e| e.file_name().to_string_lossy().into_owned()))
                .collect()
        })
        .map_err(|error| EnvelopeError {
            rule: "io".to_string(),
            message: format!("cannot read schemas directory {}: {error}", schemas_dir.display()),
        })?;
    names.sort();
    let mut registry = SchemaRegistry::new();
    for name in names {
        if !name.ends_with(".json") {
            continue;
        }
        let path = schemas_dir.join(&name);
        let text = fs::read_to_string(&path).map_err(|error| EnvelopeError {
            rule: "io".to_string(),
            message: format!("cannot read {}: {error}", path.display()),
        })?;
        let parsed: Value = serde_json::from_str(&text).map_err(|error| EnvelopeError {
            rule: "json".to_string(),
            message: format!("{} is not valid JSON: {error}", path.display()),
        })?;
        if let Some(id) = parsed.get("$id").and_then(|value| value.as_str()) {
            registry.insert(id.to_string(), (path, parsed));
        }
    }
    Ok(registry)
}

fn validate_payload_shallow(
    payload: &Value,
    schema: &Value,
    schema_id: &str,
    what: &str,
) -> Result<(), EnvelopeError> {
    let object = match payload.as_object() {
        Some(object) => object,
        None => return fail("payload-shape", format!("{what} must be a JSON object")),
    };
    if let Some(required) = schema.get("required").and_then(|value| value.as_array()) {
        for key in required {
            if let Some(key) = key.as_str() {
                if !object.contains_key(key) {
                    return fail(
                        "payload-required",
                        format!("{what} is missing required field \"{key}\" of {schema_id}"),
                    );
                }
            }
        }
    }
    if let Some(properties) = schema.get("properties").and_then(|value| value.as_object()) {
        for (key, definition) in properties {
            let Some(value) = object.get(key) else { continue };
            if let Some(constant) = definition.get("const") {
                if value != constant {
                    return fail(
                        "payload-const",
                        format!("{what} field \"{key}\" must equal {constant} per {schema_id}"),
                    );
                }
            }
        }
    }
    Ok(())
}

fn validate_resolvable_payload(
    container: &Value,
    registry: &SchemaRegistry,
    what: &str,
) -> Result<(), EnvelopeError> {
    let object = container.as_object().ok_or_else(|| {
        EnvelopeError {
            rule: "input-shape".to_string(),
            message: format!("{what} must be a JSON object"),
        }
    })?;
    let schema_id = match object.get("schema").and_then(|value| value.as_str()) {
        Some(schema_id) if !schema_id.is_empty() => schema_id,
        _ => return fail("input-shape", format!("{what}.schema must be a non-empty string")),
    };
    let Some((_, schema)) = registry.get(schema_id) else {
        return fail(
            "schema-unresolved",
            format!("{what}.schema \"{schema_id}\" is not registered in packages/schemas"),
        );
    };
    let payload = container.get("payload").unwrap_or(&Value::Null);
    validate_payload_shallow(payload, schema, schema_id, &format!("{what}.payload"))
}

fn expect_object<'a>(value: &'a Value, rule: &str, what: &str) -> Result<&'a serde_json::Map<String, Value>, EnvelopeError> {
    match value.as_object() {
        Some(object) => Ok(object),
        None => fail(rule, format!("{what} must be a JSON object")),
    }
}

pub fn validate_envelope(
    raw: &Value,
    fixture_dir_name: &str,
    registry: &SchemaRegistry,
) -> Result<(), EnvelopeError> {
    let object = expect_object(raw, "shape", "fixture envelope")?;
    for key in object.keys() {
        if !TOP_LEVEL_KEYS.contains(&key.as_str()) {
            return fail("unknown-field", format!("unknown top-level field \"{key}\""));
        }
    }
    for key in REQUIRED_TOP_LEVEL_KEYS {
        if !object.contains_key(key) {
            return fail("missing-field", format!("missing required field \"{key}\""));
        }
    }
    if object.get("fixture_envelope_version").and_then(|value| value.as_str()) != Some(ENVELOPE_VERSION) {
        return fail(
            "envelope-version",
            format!(
                "fixture_envelope_version must be \"{ENVELOPE_VERSION}\", got {}",
                object.get("fixture_envelope_version").map(|v| v.to_string()).unwrap_or_default()
            ),
        );
    }
    let fixture_id = object.get("fixture_id").and_then(|value| value.as_str()).unwrap_or("");
    if !is_kebab_path_id(fixture_id) {
        return fail("fixture-id", format!("fixture_id {fixture_id:?} is not kebab-case"));
    }
    if fixture_id != fixture_dir_name {
        return fail(
            "fixture-id",
            format!("fixture_id \"{fixture_id}\" must equal its directory name \"{fixture_dir_name}\""),
        );
    }
    let kind = object.get("kind").and_then(|value| value.as_str()).unwrap_or("");
    if !is_snake_free_name(kind) {
        return fail("kind", format!("kind {kind:?} is not a lowercase kebab-case name"));
    }
    let input = expect_object(object.get("input").unwrap_or(&Value::Null), "input-shape", "input")?;
    for key in input.keys() {
        if !INPUT_KEYS.contains(&key.as_str()) {
            return fail("input-shape", format!("unknown input field \"{key}\""));
        }
    }
    for key in INPUT_KEYS {
        if !input.contains_key(key) {
            return fail("input-shape", format!("input is missing \"{key}\""));
        }
    }
    if let Some(input_schema) = input.get("schema").and_then(|value| value.as_str()) {
        if base_schema_name(input_schema) != kind {
            return fail(
                "kind-mismatch",
                format!("kind \"{kind}\" does not match input schema base name \"{}\"", base_schema_name(input_schema)),
            );
        }
    }
    validate_resolvable_payload(object.get("input").unwrap_or(&Value::Null), registry, "input")?;
    if let Some(outputs) = object.get("expected_outputs") {
        let outputs = expect_object_wrapped_list(outputs)?;
        for output in outputs {
            let entry = expect_object(output, "output-shape", "expected_outputs entry")?;
            for key in entry.keys() {
                if !OUTPUT_KEYS.contains(&key.as_str()) {
                    return fail("output-shape", format!("unknown expected_outputs field \"{key}\""));
                }
            }
            for key in OUTPUT_KEYS {
                if !entry.contains_key(key) {
                    return fail("output-shape", format!("expected_outputs entry is missing \"{key}\""));
                }
            }
            let name = entry.get("name").and_then(|value| value.as_str()).unwrap_or("");
            if !is_snake_free_name(name) {
                return fail("output-shape", format!("expected_outputs name {name:?} is invalid"));
            }
            validate_resolvable_payload(output, registry, &format!("expected_outputs \"{name}\""))?;
        }
    }
    let provenance = expect_object(object.get("provenance").unwrap_or(&Value::Null), "provenance-shape", "provenance")?;
    for key in provenance.keys() {
        if !PROVENANCE_KEYS.contains(&key.as_str()) {
            return fail("provenance-shape", format!("unknown provenance field \"{key}\""));
        }
    }
    for key in REQUIRED_PROVENANCE_KEYS {
        if !provenance.contains_key(key) {
            return fail("provenance-shape", format!("provenance is missing \"{key}\""));
        }
    }
    let origin = provenance.get("origin").and_then(|value| value.as_str()).unwrap_or("");
    if !ORIGINS.contains(&origin) {
        return fail(
            "provenance-shape",
            format!("provenance.origin {origin:?} is not one of {}", ORIGINS.join(", ")),
        );
    }
    if !provenance.get("synthetic").map(|value| value.is_boolean()).unwrap_or(false) {
        return fail("provenance-shape", "provenance.synthetic must be a boolean");
    }
    if let Some(stability) = object.get("stability") {
        let stable = expect_object(stability, "stability-shape", "stability")?;
        for key in stable.keys() {
            if !STABILITY_KEYS.contains(&key.as_str()) {
                return fail("stability-shape", format!("unknown stability field \"{key}\""));
            }
        }
        if let Some(deterministic) = stable.get("deterministic") {
            if !deterministic.is_boolean() {
                return fail("stability-shape", "stability.deterministic must be a boolean");
            }
        }
        if let Some(ignored) = stable.get("ignored_fields") {
            let valid = ignored
                .as_array()
                .map(|items| items.iter().all(|item| item.is_string()))
                .unwrap_or(false);
            if !valid {
                return fail("stability-shape", "stability.ignored_fields must be an array of strings");
            }
        }
    }
    Ok(())
}

fn expect_object_wrapped_list(value: &Value) -> Result<&Vec<Value>, EnvelopeError> {
    match value.as_array() {
        Some(items) => Ok(items),
        None => fail("output-shape", "expected_outputs must be an array"),
    }
}

pub type LoadedFixture = (String, String);

pub fn load_fixture_envelopes(fixtures_dir: &Path, schemas_dir: &Path) -> Result<Vec<LoadedFixture>, EnvelopeError> {
    let registry = load_schema_registry(schemas_dir)?;
    let mut names: Vec<String> = fs::read_dir(fixtures_dir)
        .and_then(|entries| {
            entries
                .map(|entry| entry.map(|e| e.file_name().to_string_lossy().into_owned()))
                .collect()
        })
        .map_err(|error| EnvelopeError {
            rule: "io".to_string(),
            message: format!("cannot read fixtures directory {}: {error}", fixtures_dir.display()),
        })?;
    names.sort();
    let mut seen: BTreeMap<String, String> = BTreeMap::new();
    let mut loaded: Vec<LoadedFixture> = Vec::new();
    for name in names {
        let fixture_file = fixtures_dir.join(&name).join("fixture.json");
        if !fixture_file.is_file() {
            continue;
        }
        let text = fs::read_to_string(&fixture_file).map_err(|error| EnvelopeError {
            rule: "io".to_string(),
            message: format!("cannot read {}: {error}", fixture_file.display()),
        })?;
        let raw: Value = serde_json::from_str(&text).map_err(|error| EnvelopeError {
            rule: "json".to_string(),
            message: format!("{} is not valid JSON: {error}", fixture_file.display()),
        })?;
        validate_envelope(&raw, &name, &registry)?;
        let fixture_id = raw
            .get("fixture_id")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        if let Some(previous) = seen.get(&fixture_id) {
            return fail(
                "duplicate-id",
                format!("fixture_id \"{fixture_id}\" already defined by {previous}"),
            );
        }
        seen.insert(fixture_id.clone(), fixture_file.display().to_string());
        let schema_id = raw
            .get("input")
            .and_then(|input| input.get("schema"))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        loaded.push((fixture_id, schema_id));
    }
    Ok(loaded)
}

/// Canonical summary string; must stay byte-identical across all loader implementations.
pub fn summary_line(fixtures: &[LoadedFixture]) -> String {
    let mut sorted: Vec<&LoadedFixture> = fixtures.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let parts: Vec<String> = sorted
        .iter()
        .map(|(fixture_id, schema_id)| format!("{{\"fixture_id\":\"{fixture_id}\",\"input_schema\":\"{schema_id}\"}}"))
        .collect();
    format!("[{}]", parts.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> PathBuf {
        repo_root().expect("repo root")
    }

    fn golden() -> Vec<LoadedFixture> {
        let root = repo();
        load_fixture_envelopes(&root.join("examples").join("fixtures"), &root.join("packages").join("schemas"))
            .expect("golden fixtures must validate")
    }

    #[test]
    fn base_schema_name_strips_extension_and_version() {
        assert_eq!(base_schema_name("https://morpho.dev/schemas/research-config.v1.json"), "research-config");
    }

    #[test]
    fn golden_fixtures_load_and_validate() {
        let fixtures = golden();
        let ids: Vec<&str> = fixtures.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["brain-computer-interface", "large-language-model", "quantum-entanglement"]
        );
        for (_, schema_id) in &fixtures {
            assert_eq!(schema_id, "https://morpho.dev/schemas/research-config.v1.json");
        }
    }

    #[test]
    fn summary_line_is_deterministic_and_cross_language_comparable() {
        let fixtures = golden();
        let expected = String::from(
            "[{\"fixture_id\":\"brain-computer-interface\",\"input_schema\":\"https://morpho.dev/schemas/research-config.v1.json\"},\
             {\"fixture_id\":\"large-language-model\",\"input_schema\":\"https://morpho.dev/schemas/research-config.v1.json\"},\
             {\"fixture_id\":\"quantum-entanglement\",\"input_schema\":\"https://morpho.dev/schemas/research-config.v1.json\"}]",
        )
        .replace(' ', "");
        assert_eq!(summary_line(&fixtures), expected);
    }

    #[test]
    fn invalid_fixtures_fail_with_expected_rule() {
        let root = repo();
        let registry = load_schema_registry(&root.join("packages").join("schemas")).expect("registry");
        let cases: Vec<(&str, &str)> = vec![
            ("bad-envelope-version", "envelope-version"),
            ("fixture-id-mismatch", "fixture-id"),
            ("kind-mismatch", "kind-mismatch"),
            ("missing-provenance", "missing-field"),
            ("payload-missing-required", "payload-required"),
            ("unknown-top-level-field", "unknown-field"),
            ("unresolvable-input-schema", "schema-unresolved"),
        ];
        for (directory, rule) in cases {
            let path = root
                .join("tests")
                .join("fixtures-support")
                .join("fixtures-invalid")
                .join(directory)
                .join("fixture.json");
            let text = fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("read {path:?}: {error}"));
            let raw: Value = serde_json::from_str(&text)
                .unwrap_or_else(|error| panic!("parse {path:?}: {error}"));
            let error = validate_envelope(&raw, directory, &registry)
                .expect_err(&format!("{directory} must be rejected"));
            assert_eq!(error.rule, rule, "case {directory}: {error}");
        }
    }
}
