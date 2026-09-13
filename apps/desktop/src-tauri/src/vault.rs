//! Markdown/Obsidian vault writer foundation (RES-07 basis).
//!
//! Guarantees (docs/data/VAULT_SCHEMA.md, DO_NOT_BREAK.md):
//! * notes land in the typed folders (all fifteen PRD §10 folders, including
//!   Sources, Claims, and Maps) with stable slugs and stable node ids in the
//!   frontmatter;
//! * every write goes through a temp file plus atomic rename;
//! * a file the user changed since our last write is never overwritten —
//!   the writer returns a merge proposal instead, and files the user chose
//!   to keep are never auto-overwritten by later generations;
//! * rendering is deterministic: identical inputs yield byte-identical
//!   Markdown (wikilink sections are sorted, map sections follow the
//!   canonical folder order, and no timestamp is minted at render time).
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

/// One outgoing relation of a knowledge note, rendered as a `[[wikilink]]`
/// in the note body's Related section.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelatedLink {
    pub relation_type: String,
    pub target_node_id: String,
    pub target_title: String,
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
    /// Outgoing relations rendered as `[[wikilinks]]` in a Related section
    /// appended to the body. Older payloads without the field deserialize to
    /// "no relations".
    #[serde(default)]
    pub related: Vec<RelatedLink>,
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

/// Maps a note kind to its vault folder. All fifteen folders from PRD §10 /
/// `docs/data/VAULT_SCHEMA.md` are covered: the twelve knowledge node types
/// plus the `Source`, `Claim`, and `Map` note kinds. `Product` and `Dataset`
/// nodes still have no folder; writing them is an explicit error until
/// W2-06 extends the folder contract (see group C handoff).
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
        "Source" => Ok("Sources"),
        "Claim" => Ok("Claims"),
        "Map" => Ok("Maps"),
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

/// Canonical vault folder order (PRD §10) used for the per-project map note's
/// sections. `Maps` is excluded because the map never links itself.
pub const MOC_SECTION_ORDER: [&str; 14] = [
    "Concepts",
    "People",
    "Organizations",
    "Companies",
    "Technologies",
    "Papers",
    "Books",
    "Experiments",
    "Events",
    "Applications",
    "Policies",
    "Claims",
    "Controversies",
    "Sources",
];

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

/// Full path of a note of any kind inside the vault.
fn typed_note_path(vault_root: &Path, note_kind: &str, slug: &str) -> Result<PathBuf, CoreError> {
    Ok(vault_root
        .join(folder_for_type(note_kind)?)
        .join(format!("{slug}.md")))
}

/// Full path of a knowledge note inside the vault.
pub fn note_path(vault_root: &Path, note: &VaultNote) -> Result<PathBuf, CoreError> {
    typed_note_path(vault_root, &note.node_type, &note.slug)
}

/// A source record exported to `Sources/`. Mirrors
/// `SourceRecord` (RES-03) faithfully; `slug` derives from the title.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceNote {
    pub source_id: String,
    pub title: String,
    pub slug: String,
    pub url: String,
    pub canonical_url: String,
    pub source_type: String,
    pub status: String,
    /// Evaluated source quality (0.0-1.0); `None` until scored.
    pub quality_score: Option<f64>,
    pub retrieved_at_ms: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub provenance: String,
    pub body_markdown: String,
}

/// Full path of a source note inside the vault.
pub fn source_note_path(vault_root: &Path, note: &SourceNote) -> Result<PathBuf, CoreError> {
    typed_note_path(vault_root, "Source", &note.slug)
}

/// A claim record exported to `Claims/`. Mirrors `ClaimRecord` plus the
/// evidence/source cross-links the claim-evidence table provides.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClaimNote {
    pub claim_id: String,
    pub title: String,
    pub slug: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub scope: String,
    pub confidence: String,
    pub status: String,
    /// Evidence records backing the claim (DO_NOT_BREAK #7).
    pub evidence_ids: Vec<String>,
    /// Distinct sources of the backing evidence, derived server-side.
    pub source_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub provenance: String,
    pub body_markdown: String,
}

/// Full path of a claim note inside the vault.
pub fn claim_note_path(vault_root: &Path, note: &ClaimNote) -> Result<PathBuf, CoreError> {
    typed_note_path(vault_root, "Claim", &note.slug)
}

/// One section of a map note: a folder heading plus the note titles linked
/// as wikilinks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MapSection {
    /// Folder heading (for example "Concepts").
    pub section: String,
    /// Titles of the exported notes, linked as `[[wikilinks]]`.
    pub links: Vec<String>,
}

/// A per-project MOC-style index note written to `Maps/`, linking every
/// exported note grouped by folder in the canonical order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MapNote {
    pub project_id: String,
    pub title: String,
    pub slug: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub provenance: String,
    /// Sections in canonical folder order; empty sections are omitted.
    pub sections: Vec<MapSection>,
}

/// Full path of a map note inside the vault.
pub fn map_note_path(vault_root: &Path, note: &MapNote) -> Result<PathBuf, CoreError> {
    typed_note_path(vault_root, "Map", &note.slug)
}

/// Renders a note as Obsidian-compatible Markdown: YAML frontmatter with the
/// keys from `docs/data/VAULT_SCHEMA.md`, then the body. Outgoing relations
/// are appended as a sorted `[[wikilink]]` Related section, so rendering the
/// same inputs twice yields byte-identical output.
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
    append_related_section(&mut out, &note.related);
    out
}

/// Appends the Related section: one `- relation: [[Title]]` line per outgoing
/// relation, sorted deterministically so identical inputs always render to
/// identical bytes. Notes without relations get no section at all.
fn append_related_section(out: &mut String, related: &[RelatedLink]) {
    if related.is_empty() {
        return;
    }
    let mut sorted: Vec<&RelatedLink> = related.iter().collect();
    sorted.sort_by(|a, b| {
        (
            a.relation_type.as_str(),
            a.target_title.as_str(),
            a.target_node_id.as_str(),
        )
            .cmp(&(
                b.relation_type.as_str(),
                b.target_title.as_str(),
                b.target_node_id.as_str(),
            ))
    });
    out.push_str("\n## Related\n\n");
    for link in sorted {
        out.push_str("- ");
        out.push_str(&link.relation_type);
        out.push_str(": [[");
        out.push_str(&link.target_title);
        out.push_str("]]\n");
    }
}

/// Renders a source note: YAML frontmatter mirroring the `sources` table,
/// then the body.
pub fn render_source_markdown(note: &SourceNote) -> String {
    let mut out = String::with_capacity(512);
    out.push_str("---\n");
    push_kv(&mut out, "schema_version", &yaml_str(VAULT_SCHEMA_VERSION));
    push_kv(&mut out, "source_id", &yaml_str(&note.source_id));
    push_kv(&mut out, "type", &yaml_str("Source"));
    push_kv(&mut out, "title", &yaml_str(&note.title));
    push_kv(&mut out, "url", &yaml_str(&note.url));
    push_kv(&mut out, "canonical_url", &yaml_str(&note.canonical_url));
    push_kv(&mut out, "source_type", &yaml_str(&note.source_type));
    push_kv(&mut out, "status", &yaml_str(&note.status));
    push_kv(&mut out, "quality_score", &yaml_opt_f64(note.quality_score));
    push_kv(
        &mut out,
        "retrieved_at",
        &yaml_str(&format_rfc3339_utc(note.retrieved_at_ms)),
    );
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
    if !note.body_markdown.is_empty() {
        out.push_str(&note.body_markdown);
        out.push('\n');
    }
    out
}

/// Renders a claim note: YAML frontmatter carrying the claim contract
/// (claim id, subject/predicate/object, confidence, status, evidence and
/// source ids, timestamps), then the body.
pub fn render_claim_markdown(note: &ClaimNote) -> String {
    let mut out = String::with_capacity(512);
    out.push_str("---\n");
    push_kv(&mut out, "schema_version", &yaml_str(VAULT_SCHEMA_VERSION));
    push_kv(&mut out, "claim_id", &yaml_str(&note.claim_id));
    push_kv(&mut out, "type", &yaml_str("Claim"));
    push_kv(&mut out, "title", &yaml_str(&note.title));
    push_kv(&mut out, "subject", &yaml_str(&note.subject));
    push_kv(&mut out, "predicate", &yaml_str(&note.predicate));
    push_kv(&mut out, "object", &yaml_str(&note.object_value));
    push_kv(&mut out, "scope", &yaml_str(&note.scope));
    push_kv(&mut out, "confidence", &yaml_str(&note.confidence));
    push_kv(&mut out, "status", &yaml_str(&note.status));
    push_kv(&mut out, "evidence_ids", &yaml_list(&note.evidence_ids));
    push_kv(&mut out, "source_ids", &yaml_list(&note.source_ids));
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
    if !note.body_markdown.is_empty() {
        out.push_str(&note.body_markdown);
        out.push('\n');
    }
    out
}

/// Renders a map note: YAML frontmatter plus one wikilink list section per
/// folder in the order the sections were supplied (callers follow
/// [`MOC_SECTION_ORDER`]). Links are sorted and de-duplicated so the same
/// inputs always render to identical bytes.
pub fn render_map_markdown(note: &MapNote) -> String {
    let mut out = String::with_capacity(512);
    out.push_str("---\n");
    push_kv(&mut out, "schema_version", &yaml_str(VAULT_SCHEMA_VERSION));
    push_kv(&mut out, "type", &yaml_str("Map"));
    push_kv(&mut out, "project_id", &yaml_str(&note.project_id));
    push_kv(&mut out, "title", &yaml_str(&note.title));
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
    for section in &note.sections {
        let mut links = section.links.clone();
        links.sort();
        links.dedup();
        if links.is_empty() {
            continue;
        }
        out.push_str("## ");
        out.push_str(&section.section);
        out.push_str("\n\n");
        for link in links {
            out.push_str("- [[");
            out.push_str(&link);
            out.push_str("]]\n");
        }
        out.push('\n');
    }
    // Trim the trailing blank line left by the last section.
    while out.ends_with("\n\n") {
        out.pop();
    }
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

    /// Writes (or rewrites) a knowledge note.
    ///
    /// The only files this replaces are ones whose on-disk bytes exactly
    /// match the last core-generated content. User-modified files, files
    /// kept by a merge decision, and files this core never wrote all yield
    /// [`WriteOutcome::Conflict`] and are left untouched.
    pub fn write_note(&mut self, note: &VaultNote) -> Result<WriteOutcome, CoreError> {
        let path = note_path(&self.root, note)?;
        let rendered = render_markdown(note);
        self.write_rendered(Some(&note.node_id), &path, &rendered)
    }

    /// Writes (or rewrites) a source note under `Sources/`, with the same
    /// user-modification protection as [`VaultWriter::write_note`]. Source
    /// ids are not knowledge-node ids, so the artifact index records them
    /// without a node link.
    pub fn write_source_note(&mut self, note: &SourceNote) -> Result<WriteOutcome, CoreError> {
        let path = source_note_path(&self.root, note)?;
        let rendered = render_source_markdown(note);
        self.write_rendered(None, &path, &rendered)
    }

    /// Writes (or rewrites) a claim note under `Claims/`, with the same
    /// user-modification protection as [`VaultWriter::write_note`].
    pub fn write_claim_note(&mut self, note: &ClaimNote) -> Result<WriteOutcome, CoreError> {
        let path = claim_note_path(&self.root, note)?;
        let rendered = render_claim_markdown(note);
        self.write_rendered(None, &path, &rendered)
    }

    /// Writes (or rewrites) the per-project map note under `Maps/`, with the
    /// same user-modification protection as [`VaultWriter::write_note`].
    pub fn write_map_note(&mut self, note: &MapNote) -> Result<WriteOutcome, CoreError> {
        let path = map_note_path(&self.root, note)?;
        let rendered = render_map_markdown(note);
        self.write_rendered(None, &path, &rendered)
    }

    /// Shared write machinery: atomic replace of core-owned bytes, unchanged
    /// detection through the artifact index, and a merge proposal (never a
    /// silent overwrite) for anything the user touched. `node_id` links the
    /// artifact record to a knowledge node when one exists for the file.
    fn write_rendered(
        &mut self,
        node_id: Option<&str>,
        path: &Path,
        rendered: &str,
    ) -> Result<WriteOutcome, CoreError> {
        let path_str = path_string(path)?;
        let rendered_hash = content_hash(rendered.as_bytes());

        if !path.exists() {
            atomic_write(path, rendered.as_bytes())?;
            self.index.record(
                node_id,
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

        let current = std::fs::read(path)
            .map_err(|err| vault_error(format!("read {} failed: {err}", path.display())))?;
        let current_hash = content_hash(&current);

        let recorded = self.index.recorded(&path_str)?;
        match recorded {
            None => Ok(conflict(
                node_id.unwrap_or(""),
                path_str,
                rendered,
                current_hash,
                "file exists but was never written by the app",
            )),
            Some(state) if state.content_hash != current_hash => Ok(conflict(
                node_id.unwrap_or(""),
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
                        node_id.unwrap_or(""),
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
                    atomic_write(path, rendered.as_bytes())?;
                    self.index.record(
                        node_id,
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
    node_id: &str,
    path: String,
    rendered: &str,
    theirs_hash: String,
    reason: &str,
) -> WriteOutcome {
    WriteOutcome::Conflict(MergeProposal {
        path,
        node_id: node_id.into(),
        ours: rendered.into(),
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

/// Renders an optional score as a plain YAML scalar (`null` when unset).
fn yaml_opt_f64(value: Option<f64>) -> String {
    match value {
        None => "null".into(),
        Some(number) => format!("{number}"),
    }
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

/// Inverse of [`format_rfc3339_utc`]: parses an RFC 3339 / ISO-8601 date or
/// date-time into unix epoch milliseconds. Accepts date-only forms
/// (`2024-05-06`), `T` or space separators, optional fractional seconds,
/// and `Z` / `±HH:MM` / `±HHMM` / bare (implicit UTC) offsets. Returns
/// `None` for anything else — callers surface that as a structured
/// validation error instead of guessing a fallback instant.
pub fn parse_rfc3339_to_unix_ms(input: &str) -> Option<i64> {
    let input = input.trim();
    let (date_part, time_part) = match input.split_once('T') {
        Some(parts) => parts,
        None => match input.split_once(' ') {
            Some(parts) => parts,
            None => (input, ""),
        },
    };

    let (year, month, day) = parse_padded_date(date_part)?;
    let days = days_from_civil(year, month, day);

    let (hour, minute, second, millis, offset_secs) = if time_part.is_empty() {
        (0, 0, 0, 0, 0)
    } else {
        parse_time_and_offset(time_part)?
    };

    Some((days * 86_400 + hour * 3_600 + minute * 60 + second - offset_secs) * 1_000 + millis)
}

/// Parses a strictly padded `YYYY-MM-DD` date (RFC 3339 date-mday).
fn parse_padded_date(input: &str) -> Option<(i64, i64, i64)> {
    let bytes = input.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if !(0..10).all(|i| i == 4 || i == 7 || bytes[i].is_ascii_digit()) {
        return None;
    }
    let year: i64 = input[0..4].parse().ok()?;
    let month: i64 = input[5..7].parse().ok()?;
    let day: i64 = input[8..10].parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some((year, month, day))
}

/// Parses `HH:MM[:SS[.f..]][Z|±HH:MM|±HHMM]` into wall-clock parts plus the
/// UTC offset in seconds (subtracted to reach UTC; positive west of UTC per
/// RFC 3339 signage).
fn parse_time_and_offset(time: &str) -> Option<(i64, i64, i64, i64, i64)> {
    let (clock, offset) = match time.find(['Z', 'z', '+']) {
        Some(index) => (&time[..index], &time[index..]),
        None => match time.rfind('-') {
            // A minus offset only counts after the clock; a stray minus
            // inside the clock is not RFC 3339.
            Some(index) if index >= 5 => (&time[..index], &time[index..]),
            _ => (time, ""),
        },
    };
    let mut fields = clock.split(':');
    let hour_field = fields.next()?;
    let minute_field = fields.next()?;
    let second_field = fields.next();
    if fields.next().is_some() || hour_field.len() != 2 || minute_field.len() != 2 {
        return None;
    }
    let hour: i64 = hour_field.parse().ok()?;
    let minute: i64 = minute_field.parse().ok()?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) {
        return None;
    }
    let (second, millis) = match second_field {
        None => (0, 0),
        Some(field) => {
            let (secs, fraction) = match field.split_once('.') {
                Some((secs, fraction)) => (secs, fraction),
                None => (field, ""),
            };
            if secs.len() != 2 {
                return None;
            }
            let second: i64 = secs.parse().ok()?;
            if !(0..=59).contains(&second) {
                return None;
            }
            let millis = if fraction.is_empty() {
                0
            } else {
                if fraction.len() > 3 || !fraction.chars().all(|c| c.is_ascii_digit()) {
                    return None;
                }
                let scaled: i64 = fraction.parse().ok()?;
                scaled * 10_i64.pow(3 - fraction.len() as u32)
            };
            (second, millis)
        }
    };
    let offset_secs = if offset.is_empty() || offset == "Z" || offset == "z" {
        0
    } else {
        // RFC 3339: local = UTC + offset, so UTC = local − offset; `sign`
        // makes `+HH:MM` a positive (subtracted) offset and `-HH:MM`
        // negative (added back).
        let sign: i64 = if offset.starts_with('-') { -1 } else { 1 };
        let digits = &offset[1..];
        let off_clock = digits.strip_suffix('Z').unwrap_or(digits);
        let (h, m) = match off_clock.split_once(':') {
            Some((h, m)) => (h, m),
            None if off_clock.len() == 4 => (&off_clock[..2], &off_clock[2..]),
            None => (off_clock, "0"),
        };
        let h: i64 = h.parse().ok()?;
        let m: i64 = m.parse().ok()?;
        if !(0..=23).contains(&h) || !(0..=59).contains(&m) {
            return None;
        }
        sign * (h * 3_600 + m * 60)
    };
    Some((hour, minute, second, millis, offset_secs))
}

/// Howard Hinnant's days-from-civil algorithm — the inverse of the era math
/// in [`format_rfc3339_utc`].
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year - era * 400; // [0, 399]
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
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
            related: vec![],
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
    fn rfc3339_parsing_round_trips_and_accepts_common_forms() {
        // Canonical round trip through the formatter.
        for ms in [
            0i64,
            1_700_000_000_123,
            951_782_400_000,
            -1,
            4_102_444_800_000,
        ] {
            let formatted = format_rfc3339_utc(ms);
            assert_eq!(
                parse_rfc3339_to_unix_ms(&formatted),
                Some(ms),
                "{formatted}"
            );
        }
        // Hand-written RFC 3339 / ISO-8601 variants.
        assert_eq!(parse_rfc3339_to_unix_ms("1970-01-01"), Some(0));
        assert_eq!(parse_rfc3339_to_unix_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339_to_unix_ms("1970-01-01 00:00:00"), Some(0));
        assert_eq!(
            parse_rfc3339_to_unix_ms("2023-11-14T22:13:20.123Z"),
            Some(1_700_000_000_123)
        );
        assert_eq!(
            parse_rfc3339_to_unix_ms("2023-11-14T22:13:20.123"),
            Some(1_700_000_000_123),
            "no offset implies UTC"
        );
        assert_eq!(
            parse_rfc3339_to_unix_ms("2023-11-15T06:13:20.123+08:00"),
            Some(1_700_000_000_123),
            "+08:00 shifts the instant west"
        );
        assert_eq!(
            parse_rfc3339_to_unix_ms("2023-11-14T17:13:20.123-05:00"),
            Some(1_700_000_000_123),
            "-05:00 shifts the instant east"
        );
        assert_eq!(
            parse_rfc3339_to_unix_ms("2023-11-15T06:13:20.1+0800"),
            Some(1_700_000_000_100),
            "compact ±HHMM offset and one fractional digit"
        );
    }

    #[test]
    fn rfc3339_parsing_rejects_malformed_input() {
        for bad in [
            "",
            "not-a-date",
            "2023-13-01",
            "2023-00-10",
            "2023-02-32",
            "2023-2-3",
            "20233-11-14",
            "2023-11-14T24:00:00Z",
            "2023-11-14T10:60:00Z",
            "2023-11-14T10:00:61Z",
            "2023-11-14T10:00:00.1234Z",
            "2023-11-14T10:00:00.xZ",
            "2023-11-14T10Z",
            "2023-11-14T1:2:3Z",
            "2023-11-14T10:00:00+99:00",
            "2023/11/14",
        ] {
            assert_eq!(parse_rfc3339_to_unix_ms(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn folder_mapping_covers_all_fifteen_prd_folders() {
        // PRD §10: Concepts, People, Organizations, Companies, Technologies,
        // Papers, Books, Experiments, Events, Applications, Policies,
        // Claims, Controversies, Sources, Maps.
        let all = [
            ("Concept", "Concepts"),
            ("Person", "People"),
            ("Organization", "Organizations"),
            ("Company", "Companies"),
            ("Technology", "Technologies"),
            ("Paper", "Papers"),
            ("Book", "Books"),
            ("Experiment", "Experiments"),
            ("Event", "Events"),
            ("Application", "Applications"),
            ("Policy", "Policies"),
            ("Controversy", "Controversies"),
            ("Claim", "Claims"),
            ("Source", "Sources"),
            ("Map", "Maps"),
        ];
        for (kind, folder) in all {
            assert_eq!(folder_for_type(kind).unwrap(), folder, "kind {kind}");
        }
        // The MOC section order covers every folder except Maps itself.
        let mut moc: Vec<&str> = MOC_SECTION_ORDER.to_vec();
        moc.sort_unstable();
        let mut expected: Vec<&str> = all
            .iter()
            .map(|(_, folder)| *folder)
            .filter(|folder| *folder != "Maps")
            .collect();
        expected.sort_unstable();
        assert_eq!(moc, expected);

        // Unmapped knowledge types stay an explicit error.
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

    #[test]
    fn related_section_renders_sorted_wikilinks_deterministically() {
        let links = |order: usize| -> Vec<RelatedLink> {
            let mut all = vec![
                RelatedLink {
                    relation_type: "derives_from".into(),
                    target_node_id: "node-2".into(),
                    target_title: "Attention".into(),
                },
                RelatedLink {
                    relation_type: "used_by".into(),
                    target_node_id: "node-3".into(),
                    target_title: "BERT".into(),
                },
                RelatedLink {
                    relation_type: "derives_from".into(),
                    target_node_id: "node-4".into(),
                    target_title: "RNN".into(),
                },
            ];
            if order % 2 == 1 {
                all.reverse();
            }
            all
        };

        let mut with_relations = note("transformer");
        with_relations.related = links(0);
        let rendered = render_markdown(&with_relations);

        // Byte-identical on re-render, and independent of input order.
        assert_eq!(rendered, render_markdown(&with_relations));
        let mut shuffled = note("transformer");
        shuffled.related = links(1);
        assert_eq!(rendered, render_markdown(&shuffled));

        let section = &rendered[rendered.find("## Related").unwrap()..];
        assert!(section.contains("- derives_from: [[Attention]]"));
        assert!(section.contains("- derives_from: [[RNN]]"));
        assert!(section.contains("- used_by: [[BERT]]"));
        let attention = section.find("[[Attention]]").unwrap();
        let rnn = section.find("[[RNN]]").unwrap();
        let bert = section.find("[[BERT]]").unwrap();
        assert!(attention < rnn && rnn < bert, "links must be sorted");

        // The section sits after the body, and notes without relations have
        // no Related section at all.
        assert!(rendered.ends_with("- used_by: [[BERT]]\n"));
        assert!(!render_markdown(&note("plain")).contains("## Related"));
    }

    #[test]
    fn source_note_renders_source_contract_frontmatter() {
        let note = SourceNote {
            source_id: "src-0001".into(),
            title: "Attention Is All You Need".into(),
            slug: "attention-is-all-you-need".into(),
            url: "https://arxiv.org/abs/1706.03762".into(),
            canonical_url: "arxiv.org/abs/1706.03762".into(),
            source_type: "paper".into(),
            status: "retrieved".into(),
            quality_score: Some(0.9),
            retrieved_at_ms: 1_700_000_000_123,
            created_at_ms: 1_700_000_000_123,
            updated_at_ms: 1_700_000_500_000,
            provenance: "core/export/project/p-1".into(),
            body_markdown: "[Attention Is All You Need](https://arxiv.org/abs/1706.03762)".into(),
        };
        let rendered = render_source_markdown(&note);
        let expected_prefix = "---\n\
            schema_version: \"1.0\"\n\
            source_id: \"src-0001\"\n\
            type: \"Source\"\n\
            title: \"Attention Is All You Need\"\n\
            url: \"https://arxiv.org/abs/1706.03762\"\n\
            canonical_url: \"arxiv.org/abs/1706.03762\"\n\
            source_type: \"paper\"\n\
            status: \"retrieved\"\n\
            quality_score: 0.9\n\
            retrieved_at: \"2023-11-14T22:13:20.123Z\"\n\
            created_at: \"2023-11-14T22:13:20.123Z\"\n\
            updated_at: \"2023-11-14T22:21:40.000Z\"\n\
            provenance: \"core/export/project/p-1\"\n\
            ---\n\n";
        assert!(rendered.starts_with(expected_prefix), "got:\n{rendered}");
        assert!(rendered.ends_with("(https://arxiv.org/abs/1706.03762)\n"));

        // Unscored sources serialize the quality as null.
        let unscored = SourceNote {
            quality_score: None,
            body_markdown: String::new(),
            ..note
        };
        let rendered = render_source_markdown(&unscored);
        assert!(rendered.contains("quality_score: null\n"));
        assert!(rendered.ends_with("---\n\n"));
    }

    #[test]
    fn claim_note_renders_claim_contract_frontmatter() {
        let note = ClaimNote {
            claim_id: "claim-0001".into(),
            title: "Transformer uses attention".into(),
            slug: "transformer-uses-attention".into(),
            subject: "Transformer".into(),
            predicate: "uses".into(),
            object_value: "attention".into(),
            scope: String::new(),
            confidence: "high".into(),
            status: "draft".into(),
            evidence_ids: vec!["ev-1".into(), "ev-2".into()],
            source_ids: vec!["src-0001".into()],
            created_at_ms: 1_700_000_000_123,
            updated_at_ms: 1_700_000_500_000,
            provenance: "core/export/project/p-1".into(),
            body_markdown: "Transformer uses attention.".into(),
        };
        let rendered = render_claim_markdown(&note);
        let expected_prefix = "---\n\
            schema_version: \"1.0\"\n\
            claim_id: \"claim-0001\"\n\
            type: \"Claim\"\n\
            title: \"Transformer uses attention\"\n\
            subject: \"Transformer\"\n\
            predicate: \"uses\"\n\
            object: \"attention\"\n\
            scope: \"\"\n\
            confidence: \"high\"\n\
            status: \"draft\"\n\
            evidence_ids: [\"ev-1\", \"ev-2\"]\n\
            source_ids: [\"src-0001\"]\n\
            created_at: \"2023-11-14T22:13:20.123Z\"\n\
            updated_at: \"2023-11-14T22:21:40.000Z\"\n\
            provenance: \"core/export/project/p-1\"\n\
            ---\n\n";
        assert!(rendered.starts_with(expected_prefix), "got:\n{rendered}");
        assert!(rendered.ends_with("Transformer uses attention.\n"));
    }

    #[test]
    fn map_note_renders_moc_sections_in_canonical_order() {
        let note = MapNote {
            project_id: "p-1".into(),
            title: "BCI Map".into(),
            slug: "bci-map".into(),
            created_at_ms: 1_700_000_000_000,
            updated_at_ms: 1_700_000_500_000,
            provenance: "core/export/project/p-1".into(),
            sections: vec![
                MapSection {
                    section: "Concepts".into(),
                    links: vec!["BERT".into(), "Attention".into(), "Attention".into()],
                },
                MapSection {
                    section: "Claims".into(),
                    links: vec!["Transformer uses attention".into()],
                },
                MapSection {
                    section: "Sources".into(),
                    links: vec!["Attention Is All You Need".into()],
                },
            ],
        };
        let rendered = render_map_markdown(&note);
        let expected_prefix = "---\n\
            schema_version: \"1.0\"\n\
            type: \"Map\"\n\
            project_id: \"p-1\"\n\
            title: \"BCI Map\"\n\
            created_at: \"2023-11-14T22:13:20.000Z\"\n\
            updated_at: \"2023-11-14T22:21:40.000Z\"\n\
            provenance: \"core/export/project/p-1\"\n\
            ---\n\n";
        assert!(rendered.starts_with(expected_prefix), "got:\n{rendered}");
        // Links are sorted and de-duplicated inside each section.
        assert!(rendered.contains("## Concepts\n\n- [[Attention]]\n- [[BERT]]\n"));
        assert!(rendered.contains("## Claims\n\n- [[Transformer uses attention]]\n"));
        assert!(rendered.contains("## Sources\n\n- [[Attention Is All You Need]]\n"));
        // Rendering is byte-stable and sections keep their supplied order.
        assert_eq!(rendered, render_map_markdown(&note));
        let concepts = rendered.find("## Concepts").unwrap();
        let claims = rendered.find("## Claims").unwrap();
        let sources = rendered.find("## Sources").unwrap();
        assert!(concepts < claims && claims < sources);

        // Sections without links are omitted entirely.
        let empty = MapNote {
            sections: vec![MapSection {
                section: "Events".into(),
                links: vec![],
            }],
            ..note
        };
        assert!(!render_map_markdown(&empty).contains("## Events"));
    }

    #[test]
    fn source_claim_and_map_notes_write_with_merge_protection() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = MemoryIndex::new();
        let root = dir.path().join("vault");

        let source = SourceNote {
            source_id: "src-0001".into(),
            title: "Attention Is All You Need".into(),
            slug: "attention-is-all-you-need".into(),
            url: "https://arxiv.org/abs/1706.03762".into(),
            canonical_url: "arxiv.org/abs/1706.03762".into(),
            source_type: "paper".into(),
            status: "retrieved".into(),
            quality_score: None,
            retrieved_at_ms: 1_700_000_000_123,
            created_at_ms: 1_700_000_000_123,
            updated_at_ms: 1_700_000_000_123,
            provenance: "core/export/project/p-1".into(),
            body_markdown: String::new(),
        };
        let claim = ClaimNote {
            claim_id: "claim-0001".into(),
            title: "Transformer uses attention".into(),
            slug: "transformer-uses-attention".into(),
            subject: "Transformer".into(),
            predicate: "uses".into(),
            object_value: "attention".into(),
            scope: String::new(),
            confidence: "high".into(),
            status: "draft".into(),
            evidence_ids: vec![],
            source_ids: vec!["src-0001".into()],
            created_at_ms: 1_700_000_000_123,
            updated_at_ms: 1_700_000_000_123,
            provenance: "core/export/project/p-1".into(),
            body_markdown: String::new(),
        };
        let map = MapNote {
            project_id: "p-1".into(),
            title: "BCI Map".into(),
            slug: "bci-map".into(),
            created_at_ms: 1_700_000_000_000,
            updated_at_ms: 1_700_000_000_000,
            provenance: "core/export/project/p-1".into(),
            sections: vec![MapSection {
                section: "Concepts".into(),
                links: vec!["Transformer".into()],
            }],
        };

        let source_file = root.join("Sources").join("attention-is-all-you-need.md");
        let claim_file = root.join("Claims").join("transformer-uses-attention.md");
        let map_file = root.join("Maps").join("bci-map.md");

        {
            let mut writer = VaultWriter::new(&root, &mut index);
            assert!(matches!(
                writer.write_source_note(&source).unwrap(),
                WriteOutcome::Written { .. }
            ));
            assert!(matches!(
                writer.write_claim_note(&claim).unwrap(),
                WriteOutcome::Written { .. }
            ));
            assert!(matches!(
                writer.write_map_note(&map).unwrap(),
                WriteOutcome::Written { .. }
            ));
        }
        assert!(source_file.exists() && claim_file.exists() && map_file.exists());

        // Identical content is detected as unchanged, not rewritten.
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            assert!(matches!(
                writer.write_source_note(&source).unwrap(),
                WriteOutcome::Unchanged { .. }
            ));
            assert!(matches!(
                writer.write_claim_note(&claim).unwrap(),
                WriteOutcome::Unchanged { .. }
            ));
            assert!(matches!(
                writer.write_map_note(&map).unwrap(),
                WriteOutcome::Unchanged { .. }
            ));
        }

        // A user edit yields a merge proposal, never a silent overwrite.
        let user_bytes = "user's own source notes\n";
        std::fs::write(&source_file, user_bytes).unwrap();
        {
            let mut writer = VaultWriter::new(&root, &mut index);
            match writer.write_source_note(&source).unwrap() {
                WriteOutcome::Conflict(proposal) => {
                    // Source ids are not knowledge-node ids, so proposals
                    // for them carry no node id.
                    assert_eq!(proposal.node_id, "");
                }
                other => panic!("expected Conflict, got {other:?}"),
            }
            assert_eq!(std::fs::read_to_string(&source_file).unwrap(), user_bytes);
        }

        // No temp files are left behind in the new folders.
        for folder in ["Sources", "Claims", "Maps"] {
            let leftovers: Vec<_> = std::fs::read_dir(root.join(folder))
                .unwrap()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().contains("morpho-tmp"))
                .collect();
            assert!(leftovers.is_empty());
        }
    }
}
