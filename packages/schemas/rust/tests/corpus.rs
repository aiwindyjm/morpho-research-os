//! Cross-language contract corpus test (Serde leg).
//!
//! Walks `packages/schemas/fixtures/cases` and asserts that the Serde bindings
//! accept/reject exactly the cases the corpus expects, and that every canonical
//! schema file has a binding plus both expectations.

use std::fs;
use std::path::{Path, PathBuf};

use morpho_schemas::validate_binding;

const NAME_PATTERN: fn(&str) -> bool = |name| {
    let mut chars = name.chars();
    let first_ok = chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
};

fn schemas_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn cases_dir() -> PathBuf {
    schemas_dir().join("fixtures").join("cases")
}

/// Refuses to read anything that escapes `root` (path traversal guard).
fn contained(root: &Path, target: &Path) -> PathBuf {
    let resolved_root = root.canonicalize().expect("root exists");
    let resolved_target = target.canonicalize().expect("target exists");
    if resolved_target != resolved_root && !resolved_target.starts_with(&resolved_root) {
        panic!(
            "refusing to read outside {}: {}",
            resolved_root.display(),
            resolved_target.display()
        );
    }
    resolved_target
}

fn case_files() -> Vec<(String, PathBuf, bool)> {
    let mut cases = Vec::new();
    let root = cases_dir();
    let mut schema_dirs: Vec<PathBuf> = fs::read_dir(&root)
        .expect("fixtures/cases readable")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    schema_dirs.sort();
    for schema_dir in schema_dirs {
        let schema_name = schema_dir
            .file_name()
            .and_then(|n| n.to_str())
            .expect("utf-8 schema dir name")
            .to_string();
        if !NAME_PATTERN(&schema_name) {
            continue;
        }
        let mut files: Vec<PathBuf> = fs::read_dir(&schema_dir)
            .expect("schema case dir readable")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.is_file())
            .collect();
        files.sort();
        for file in files {
            let file_name = file
                .file_name()
                .and_then(|n| n.to_str())
                .expect("utf-8 name")
                .to_string();
            if file_name.starts_with("valid-") {
                cases.push((schema_name.clone(), file, true));
            } else if file_name.starts_with("invalid-") {
                cases.push((schema_name.clone(), file, false));
            }
        }
    }
    cases
}

fn schema_files() -> Vec<(String, PathBuf)> {
    let mut files = Vec::new();
    let mut entries: Vec<PathBuf> = fs::read_dir(schemas_dir())
        .expect("packages/schemas readable")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    entries.sort();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .expect("utf-8 name")
            .to_string();
        let Some(stem) = name.strip_suffix(".json") else {
            continue;
        };
        let Some((base, version)) = stem.rsplit_once(".v") else {
            continue;
        };
        if !version.chars().all(|c| c.is_ascii_digit()) || version.is_empty() {
            continue;
        }
        if !NAME_PATTERN(base) {
            continue;
        }
        files.push((base.to_string(), path));
    }
    files
}

#[test]
fn corpus_is_not_empty() {
    assert!(!case_files().is_empty(), "no corpus cases found");
}

#[test]
fn every_schema_has_binding_and_both_expectations() {
    let cases = case_files();
    for (name, _path) in schema_files() {
        assert!(
            morpho_schemas::BINDING_NAMES.contains(&name.as_str()),
            "schema '{name}' has no Serde binding"
        );
        let has_valid = cases
            .iter()
            .any(|(case_name, _, valid)| case_name == &name && *valid);
        let has_invalid = cases
            .iter()
            .any(|(case_name, _, valid)| case_name == &name && !*valid);
        assert!(has_valid, "schema '{name}' has no valid case");
        assert!(has_invalid, "schema '{name}' has no invalid case");
    }
}

#[test]
fn serde_bindings_agree_with_corpus_expectations() {
    let root = cases_dir();
    for (schema_name, file, expect_valid) in case_files() {
        let target = contained(&root, &file);
        let raw = fs::read_to_string(&target).expect("case file readable");
        let instance: serde_json::Value =
            serde_json::from_str(&raw).expect("case file is valid JSON");
        let result = validate_binding(&schema_name, &instance);
        let label = format!(
            "{}/{}",
            schema_name,
            target.file_name().unwrap().to_string_lossy()
        );
        assert_eq!(
            result.is_ok(),
            expect_valid,
            "{label}: Serde binding said {}, expected {} ({})",
            result.is_ok(),
            expect_valid,
            result.err().unwrap_or_default()
        );
    }
}
