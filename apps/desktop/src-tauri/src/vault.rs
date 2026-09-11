//! Markdown/Obsidian vault writer foundation (RES-07 basis).
//!
//! Guarantees (docs/data/VAULT_SCHEMA.md, DO_NOT_BREAK.md):
//! * notes land in the typed folders with stable slugs and stable node ids
//!   in the frontmatter;
//! * every write goes through a temp file plus atomic rename;
//! * a file the user changed since our last write is never overwritten —
//!   the writer returns a merge proposal instead, and files the user chose
//!   to keep are never auto-overwritten by later generations.
//!
//! Knowledge field semantics come from the W2-06 contract (not yet frozen);
//! the frontmatter keys below mirror `docs/data/VAULT_SCHEMA.md` directly.

use crate::error::{CoreError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Vault schema version stamped into every note.
pub const VAULT_SCHEMA_VERSION: &str = "1.0";

/// What the artifact index knows about one vault file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtifactState {
    pub content_hash: String,
    /// True when the recorded bytes are the user's own (kept via a merge
    /// decision) rather than core-generated content.
    pub user_authored: bool,
}

/// The port through which the writer knows what it last wrote. Backed by the
/// `artifacts` table in production (see `repositories::artifacts`).
pub trait ArtifactIndex {
    fn recorded(&self, path: &str) -> Result<Option<ArtifactState>, CoreError>;
    fn record(
        &mut self,
        node_id: Option<&str>,
        path: &str,
        content_hash: &str,
        byte_size: u64,
        user_authored: bool,
    ) -> Result<(), CoreError>;
}

/// A note to write into the vault. `node_id` and `slug` are stable identities
/// owned by the knowledge layer; the writer never regenerates them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VaultNote {
    pub node_id: String,
    pub node_type: String,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub status: String,
    pub confidence: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub source_ids: Vec<String>,
    pub claim_ids: Vec<String>,
    pub provenance: String,
    pub body_markdown: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

/// Outcome of writing a note.
#[derive(Debug, Clone, PartialEq)]
pub enum WriteOutcome {
    /// The note was written (or rewritten) atomically.
    Written { path: String, content_hash: String },
    /// The rendered note matches the recorded content; nothing was written.
    Unchanged { path: String },
    /// The file must not be overwritten automatically; resolve explicitly.
    Conflict(MergeProposal),
}

/// Description of a file the writer refuses to overwrite.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MergeProposal {
    pub path: String,
    pub node_id: String,
    /// What this core would write ("ours").
    pub ours: String,
    /// Hash of the current on-disk content ("theirs").
    pub theirs_hash: String,
    pub reason: String,
}

/// Explicit conflict resolutions; auto-overwriting is not an option.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolution {
    /// Keep the user's file and record it as the user-authored baseline;
    /// later generated content still requires an explicit overwrite.
    KeepUser,
    /// Replace the file with our rendered content on the user's behalf.
    UseOurs,
}

/// Maps a node type to its vault folder. `Product` and `Dataset` have no
/// folder in `docs/data/VAULT_SCHEMA.md` yet; writing them is an explicit
/// error until W2-06 extends the folder contract (see group C handoff).
pub fn folder_for_type(node_type: &str) -> Result<&'static str, CoreError> {
    match node_type {
        "Concept" => Ok("Concepts"),
        "Person" => Ok("People"),
        "Organization" => Ok("Organizations"),
        "Company" => Ok("Companies"),
        "Paper" => Ok("Papers"),
        "Book" => Ok("Books"),
        "Experiment" => Ok("Experiments"),
        "Event" => Ok("Events"),
        "Technology" => Ok("Technologies"),
        "Application" => Ok("Applications"),
        "Policy" => Ok("Policies"),
        "Controversy" => Ok("Controversies"),
        other => Err(CoreError::new(
            ErrorCode::VaultWriteFailed,
            "This knowledge type cannot be written to the vault yet.",
            format!(
                "no vault folder defined for node type '{other}' (pending W2-06 folder contract)"
            ),
            false,
        )),
    }
}

/// Stable, filesystem-safe slug derived from a title.
pub fn slugify(title: &str) -> String {
    let mut slug = String::with_capacity(title.len());
    let mut last_dash = true; // suppress leading dashes
    for ch in title.chars() {
        let lowered = ch.to_ascii_lowercase();
        if lowered.is_ascii_alphanumeric() {
            slug.push(lowered);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.len() > 80 {
        slug.truncate(80);
        while slug.ends_with('-') {
            slug.pop();
        }
    }
    slug
}

/// Full path of a note inside the vault.
pub fn note_path(vault_root: &Path, note: &VaultNote) -> Result<PathBuf, CoreError> {
    let folder = folder_for_type(&note.node_type)?;
    Ok(vault_root.join(folder).join(format!("{}.md", note.slug)))
}

/// Renders a note as Obsidian-compatible Markdown: YAML frontmatter with the
/// keys from `docs/data/VAULT_SCHEMA.md`, then the body.
pub fn render_markdown(note: &VaultNote) -> String {
    let mut out = String::with_capacity(512);
    out.push_str("---\n");
    push_kv(&mut out, "schema_version", &yaml_str(VAULT_SCHEMA_VERSION));
    push_kv(&mut out, "node_id", &yaml_str(&note.node_id));
    push_kv(&mut out, "type", &yaml_str(&note.node_type));
    push_kv(&mut out, "title", &yaml_str(&note.title));
    push_kv(&mut out, "aliases", &yaml_list(&note.aliases));
    push_kv(&mut out, "tags", &yaml_list(&note.tags));
    push_kv(&mut out, "confidence", &yaml_str(&note.confidence));
    push_kv(&mut out, "status", &yaml_str(&note.status));
    push_kv(&mut out, "source_ids", &yaml_list(&note.source_ids));
    push_kv(&mut out, "claim_ids", &yaml_list(&note.claim_ids));
    push_kv(
        &mut out,
        "created_at",
        &yaml_str(&format_rfc3339_utc(note.created_at_ms)),
    );
    push_kv(
        &mut out,
        "updated_at",
        &yaml_str(&format_rfc3339_utc(note.updated_at_ms)),
    );
    push_kv(&mut out, "provenance", &yaml_str(&note.provenance));
    out.push_str("---\n\n");
    if !note.summary.is_empty() {
        out.push_str(&note.summary);
        out.push_str("\n\n");
    }
    out.push_str(&note.body_markdown);
    out.push('\n');
    out
}

/// Writes notes into a vault directory with user-modification protection.
pub struct VaultWriter<'a> {
    root: PathBuf,
    index: &'a mut dyn ArtifactIndex,
}

impl<'a> VaultWriter<'a> {
    pub fn new(root: impl Into<PathBuf>, index: &'a mut dyn ArtifactIndex) -> Self {
        Self {
            root: root.into(),
            index,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Writes (or rewrites) a note.
    ///
    /// The only files this replaces are ones whose on-disk bytes exactly
    /// match the last core-generated content. User-modified files, files
    /// kept by a merge decision, and files this core never wrote all yield
    /// [`WriteOutcome::Conflict`] and are left untouched.
    pub fn write_note(&mut self, note: &VaultNote) -> Result<WriteOutcome, CoreError> {
        let path = note_path(&self.root, note)?;
        let path_str = path_string(&path)?;
        let rendered = render_markdown(note);
        let rendered_hash = content_hash(rendered.as_bytes());

        if !path.exists() {
            atomic_write(&path, rendered.as_bytes())?;
            self.index.record(
                Some(&note.node_id),
                &path_str,
                &rendered_hash,
                rendered.len() as u64,
                false,
            )?;
            return Ok(WriteOutcome::Written {
                path: path_str,
                content_hash: rendered_hash,
            });
        }

        let current = std::fs::read(&path)
            .map_err(|err| vault_error(format!("read {} failed: {err}", path.display())))?;
        let current_hash = content_hash(&current);

        let recorded = self.index.recorded(&path_str)?;
        match recorded {
            None => Ok(conflict(
                note,
                path_str,
                rendered,
                current_hash,
                "file exists but was never written by the app",
            )),
            Some(state) if state.content_hash != current_hash => Ok(conflict(
                note,
                path_str,
                rendered,
                current_hash,
                "file changed outside the app since the last write",
            )),
            Some(state) if state.user_authored => {
                if current_hash == rendered_hash {
                    Ok(WriteOutcome::Unchanged { path: path_str })
                } else {
                    Ok(conflict(
                        note,
                        path_str,
                        rendered,
                        current_hash,
                        "file was kept by an explicit user decision",
                    ))
                }
            }
            Some(state) => {
                if state.content_hash == rendered_hash {
                    Ok(WriteOutcome::Unchanged { path: path_str })
                } else {
                    // Last core write, untouched since: safe to regenerate.
                    atomic_write(&path, rendered.as_bytes())?;
                    self.index.record(
                        Some(&note.node_id),
                        &path_str,
                        &rendered_hash,
                        rendered.len() as u64,
                        false,
                    )?;
                    Ok(WriteOutcome::Written {
                        path: path_str,
                        content_hash: rendered_hash,
                    })
                }
            }
        }
    }

    /// Resolves a conflict explicitly. Neither option is ever applied
    /// automatically by `write_note`.
    pub fn resolve(
        &mut self,
        proposal: &MergeProposal,
        resolution: Resolution,
    ) -> Result<WriteOutcome, CoreError> {
        let path = Path::new(&proposal.path);
        match resolution {
            Resolution::KeepUser => {
                let current = std::fs::read(path)
                    .map_err(|err| vault_error(format!("read {} failed: {err}", path.display())))?;
                let hash = content_hash(&current);
                let node_id = user_owned_node_id(proposal);
                self.index.record(
                    node_id.as_deref(),
                    &proposal.path,
                    &hash,
                    current.len() as u64,
                    true,
                )?;
                Ok(WriteOutcome::Unchanged {
                    path: proposal.path.clone(),
                })
            }
            Resolution::UseOurs => {
                atomic_write(path, proposal.ours.as_bytes())?;
                let hash = content_hash(proposal.ours.as_bytes());
                let node_id = user_owned_node_id(proposal);
                self.index.record(
                    node_id.as_deref(),
                    &proposal.path,
                    &hash,
                    proposal.ours.len() as u64,
                    false,
                )?;
                Ok(WriteOutcome::Written {
                    path: proposal.path.clone(),
                    content_hash: hash,
                })
            }
        }
    }
}

fn conflict(
    note: &VaultNote,
    path: String,
    rendered: String,
    theirs_hash: String,
    reason: &str,
) -> WriteOutcome {
    WriteOutcome::Conflict(MergeProposal {
        path,
        node_id: note.node_id.clone(),
        ours: rendered,
        theirs_hash,
        reason: reason.into(),
    })
}

fn user_owned_node_id(proposal: &MergeProposal) -> Option<String> {
    if proposal.node_id.is_empty() {
        None
    } else {
        Some(proposal.node_id.clone())
    }
}

fn path_string(path: &Path) -> Result<String, CoreError> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| vault_error(format!("path is not UTF-8: {}", path.display())))
}

/// Writes bytes to a temp file in the target directory, fsyncs, then renames
/// over the target (atomic on the same filesystem; `rename` replaces an
/// existing file on Windows).
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| vault_error(format!("create {} failed: {err}", parent.display())))?;
    }
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| vault_error(format!("invalid file name: {}", path.display())))?;
    let tmp = path.with_file_name(format!(".{file_name}.morpho-tmp"));
    let write_result = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    })();
    write_result.map_err(|err| {
        let _ = std::fs::remove_file(&tmp);
        vault_error(format!("atomic write {} failed: {err}", path.display()))
    })
}

fn vault_error(detail: String) -> CoreError {
    CoreError::new(
        ErrorCode::VaultWriteFailed,
        "Writing to the knowledge vault failed.",
        detail,
        false,
    )
}

/// FNV-1a 64-bit content hash with length suffix, hex-encoded.
/// Deterministic across platforms; sufficient for local modification
/// detection.
pub fn content_hash(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("{hash:016x}-{:#07x}", bytes.len())
}

fn push_kv(out: &mut String, key: &str, value: &str) {
    out.push_str(key);
    out.push_str(": ");
    out.push_str(value);
    out.push('\n');
}

fn yaml_str(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => {}
            '\t' => escaped.push_str("\\t"),
            c if (c as u32) < 0x20 => escaped.push_str(&format!("\\u{:04x}", c as u32)),
            c => escaped.push(c),
        }
    }
    escaped.push('"');
    escaped
}

fn yaml_list(items: &[String]) -> String {
    if items.is_empty() {
        return "[]".into();
    }
    let rendered: Vec<String> = items.iter().map(|item| yaml_str(item)).collect();
    format!("[{}]", rendered.join(", "))
}

/// Formats unix epoch milliseconds as an RFC 3339 UTC timestamp without a
/// calendar dependency (Howard Hinnant's civil-from-days algorithm).
pub fn format_rfc3339_utc(unix_ms: i64) -> String {
    let unix_secs = unix_ms.div_euclid(1_000);
    let millis = unix_ms.rem_euclid(1_000);
    let days = unix_secs.div_euclid(86_400);
    let secs_of_day = unix_secs.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    /// In-memory artifact index for unit tests.
    struct MemoryIndex {
        entries: RefCell<HashMap<String, (String, String, bool)>>, // path -> (hash, node_id, user_authored)
    }

    impl MemoryIndex {
        fn new() -> Self {
            Self {
                entries: RefCell::new(HashMap::new()),
            }
        }
    }

    impl ArtifactIndex for MemoryIndex {
        fn recorded(&self, path: &str) -> Result<Option<ArtifactState>, CoreError> {
            Ok(self
                .entries
                .borrow()
                .get(path)
                .map(|(hash, _, user)| ArtifactState {
                    content_hash: hash.clone(),
                    user_authored: *user,
                }))
        }

        fn record(
            &mut self,
            node_id: Option<&str>,
            path: &str,
            content_hash: &str,
            _byte_size: u64,
            user_authored: bool,
        ) -> Result<(), CoreError> {
            self.entries.borrow_mut().insert(
                path.into(),
                (
                    content_hash.into(),
                    node_id.unwrap_or("").into(),
                    user_authored,
                ),
            );
            Ok(())
        }
    }

    fn note(slug: &str) -> VaultNote {
        VaultNote {
            node_id: "node-0001".into(),
            node_type: "Concept".into(),
            title: "Transformer".into(),
            slug: slug.into(),
            summary: "Attention-based architecture.".into(),
            status: "draft".into(),
            confidence: "high".into(),
            aliases: vec!["transformer model".into()],
            tags: vec!["deep-learning".into()],
            source_ids: vec!["src-1".into()],
            claim_ids: vec![],
            provenance: "run-1/task-2".into(),
            body_markdown: "See [[Attention]].".into(),
            created_at_ms: 1_700_000_000_123,
            updated_at_ms: 1_700_000_500_000,
        }
    }

    #[test]
    fn slugify_is_stable_and_filesystem_safe() {
        assert_eq!(slugify("Transformer"), "transformer");
        assert_eq!(
            slugify("BERT: Bidirectional Encoder"),
            "bert-bidirectional-encoder"
        );
        assert_eq!(slugify("  --many   spaces-- "), "many-spaces");
        assert_eq!(slugify("大语言模型"), "");
        assert_eq!(slugify(&"x".repeat(200)).len(), 80);
    }

    #[test]
    fn rfc3339_formatting_matches_known_values() {
        assert_eq!(format_rfc3339_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            format_rfc3339_utc(1_700_000_000_123),
            "2023-11-14T22:13:20.123Z"
        );
        assert_eq!(
            format_rfc3339_utc(951_782_400_000),
            "2000-02-29T00:00:00.000Z"
        );
    }

    #[test]
    fn folder_mapping_follows_vault_schema() {
        assert_eq!(folder_for_type("Concept").unwrap(), "Concepts");
        assert_eq!(folder_for_type("Person").unwrap(), "People");
        assert_eq!(folder_for_type("Technology").unwrap(), "Technologies");
        let err = folder_for_type("Product").unwrap_err();
        assert_eq!(err.code, ErrorCode::VaultWriteFailed);
        assert!(err.developer_detail.contains("pending W2-06"));
    }

    #[test]
    fn rendered_markdown_has_stable_frontmatter() {
        let rendered = render_markdown(&note("transformer"));
        let expected_prefix = "---\n\
            schema_version: \"1.0\"\n\
            node_id: \"node-0001\"\n\
            type: \"Concept\"\n\
            title: \"Transformer\"\n\
            aliases: [\"transformer model\"]\n\
            tags: [\"deep-learning\"]\n\
            confidence: \"high\"\n\
            status: \"draft\"\n\
            source_ids: [\"src-1\"]\n\
            claim_ids: []\n\
            created_at: \"2023-11-14T22:13:20.123Z\"\n\
            updated_at: \"2023-11-14T22:21:40.000Z\"\n\
            provenance: \"run-1/task-2\"\n\
            ---\n\n";
        assert!(rendered.starts_with(expected_prefix), "got:\n{rendered}");
        assert!(rendered.ends_with("Attention-based architecture.\n\nSee [[Attention]].\n"));
    }

    #[test]
    fn content_hash_is_deterministic_and_content_sensitive() {
        let a = content_hash(b"hello");
        assert_eq!(a, content_hash(b"hello"));
        assert_ne!(a, content_hash(b"hellp"));
    }

    #[test]
    fn write_is_atomic_unchanged_and_conflict_aware() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = MemoryIndex::new();
        let root = dir.path().join("vault");
        let note_file = root.join("Concepts").join("transformer.md");

        // Fresh write creates the folder structure.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            let outcome = writer.write_note(&note("transformer")).unwrap();
            assert!(matches!(outcome, WriteOutcome::Written { .. }));
            assert!(note_file.exists());
        }

        // Same note again: unchanged, no rewrite.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            let outcome = writer.write_note(&note("transformer")).unwrap();
            assert!(matches!(outcome, WriteOutcome::Unchanged { .. }));
        }

        // Updated note rewrites cleanly: the user did not touch the file.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            let mut updated = note("transformer");
            updated.summary = "Attention-based architecture, revised.".into();
            let outcome = writer.write_note(&updated).unwrap();
            assert!(matches!(outcome, WriteOutcome::Written { .. }));
        }

        // User edits the file behind our back: next write must conflict and
        // preserve the user's bytes.
        let user_content = "user's own notes\n";
        std::fs::write(&note_file, user_content).unwrap();
        let mut proposal = {
            let mut writer = VaultWriter::new(&root, &mut index);
            match writer.write_note(&note("transformer")).unwrap() {
                WriteOutcome::Conflict(proposal) => proposal,
                other => panic!("expected Conflict, got {other:?}"),
            }
        };
        assert_eq!(proposal.node_id, "node-0001");
        assert_eq!(proposal.theirs_hash, content_hash(user_content.as_bytes()));
        assert_eq!(std::fs::read_to_string(&note_file).unwrap(), user_content);

        // KeepUser re-baselines; later generated content still conflicts
        // instead of silently overwriting the user's file.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            writer.resolve(&proposal, Resolution::KeepUser).unwrap();
            let mut newer = note("transformer");
            newer.summary = "regenerated summary".into();
            let outcome = writer.write_note(&newer).unwrap();
            match outcome {
                WriteOutcome::Conflict(p) => {
                    assert!(
                        p.reason.contains("user decision"),
                        "got reason: {}",
                        p.reason
                    );
                    proposal = p;
                }
                other => panic!("expected Conflict after KeepUser, got {other:?}"),
            }
            assert_eq!(std::fs::read_to_string(&note_file).unwrap(), user_content);
        }

        // UseOurs is the explicit path to overwrite with generated content.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            let outcome = writer.resolve(&proposal, Resolution::UseOurs).unwrap();
            assert!(matches!(outcome, WriteOutcome::Written { .. }));
            assert!(std::fs::read_to_string(&note_file)
                .unwrap()
                .starts_with("---\n"));
        }

        // No temp files are left behind.
        let leftovers: Vec<_> = std::fs::read_dir(root.join("Concepts"))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("morpho-tmp"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn unrecorded_existing_file_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = MemoryIndex::new();
        let root = dir.path().join("vault");
        let note_file = root.join("Concepts").join("hand-made.md");
        std::fs::create_dir_all(note_file.parent().unwrap()).unwrap();
        std::fs::write(&note_file, "made by hand in Obsidian").unwrap();

        let mut writer = VaultWriter::new(&root, &mut index);
        let outcome = writer.write_note(&note("hand-made")).unwrap();
        match outcome {
            WriteOutcome::Conflict(proposal) => {
                assert!(proposal.reason.contains("never written by the app"));
            }
            other => panic!("expected Conflict, got {other:?}"),
        }
        assert_eq!(
            std::fs::read_to_string(&note_file).unwrap(),
            "made by hand in Obsidian"
        );
    }

    #[test]
    fn unwritable_type_reports_structured_error() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = MemoryIndex::new();
        let mut writer = VaultWriter::new(dir.path(), &mut index);
        let mut bad = note("product-thing");
        bad.node_type = "Product".into();
        let err = writer.write_note(&bad).unwrap_err();
        assert_eq!(err.code, ErrorCode::VaultWriteFailed);
    }
}
