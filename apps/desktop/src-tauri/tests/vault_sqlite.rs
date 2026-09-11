//! Vault writer end-to-end against the SQLite artifact index (RES-07
//! basis): the writer's user-modification protection must hold when the
//! index is the real `artifacts` table.

use morpho_desktop_lib::db::migrated_memory_db;
use morpho_desktop_lib::repositories::artifacts::DbArtifactIndex;
use morpho_desktop_lib::repositories::knowledge::{KnowledgeNodes, NewKnowledgeNode};
use morpho_desktop_lib::repositories::projects::{NewProject, Projects};
use morpho_desktop_lib::repositories::with_write_tx;
use morpho_desktop_lib::vault::{Resolution, VaultNote, VaultWriter, WriteOutcome};

fn note(node_id: String, slug: &str) -> VaultNote {
    VaultNote {
        node_id,
        node_type: "Technology".into(),
        title: "Wikilink".into(),
        slug: slug.into(),
        summary: "Summary.".into(),
        status: "draft".into(),
        confidence: "medium".into(),
        aliases: vec![],
        tags: vec!["test".into()],
        source_ids: vec!["src-9".into()],
        claim_ids: vec![],
        provenance: "run-9/task-9".into(),
        body_markdown: "Body with [[Link]].".into(),
        created_at_ms: 1_700_000_000_000,
        updated_at_ms: 1_700_000_000_000,
    }
}

#[test]
fn vault_writer_works_against_the_sqlite_artifact_index() {
    let mut conn = migrated_memory_db().unwrap();
    let project_id = with_write_tx(&mut conn, |tx| {
        Projects::insert(
            tx,
            &NewProject {
                name: "P".into(),
                description: String::new(),
            },
        )
        .map(|p| p.id)
    })
    .unwrap();
    let node_id = with_write_tx(&mut conn, |tx| {
        KnowledgeNodes::upsert_by_slug(
            tx,
            &NewKnowledgeNode {
                project_id: project_id.clone(),
                node_type: "Technology".into(),
                title: "Wikilink".into(),
                slug: "wikilink".into(),
                summary: String::new(),
                confidence: "unverified".into(),
                aliases: vec![],
                tags: vec![],
                source_ids: vec![],
                claim_ids: vec![],
            },
        )
        .map(|(record, _)| record.id)
    })
    .unwrap();

    let vault_root = tempfile::tempdir().unwrap();
    let note_path = vault_root.path().join("Technologies").join("wikilink.md");

    // First write goes through the SQL index.
    {
        let mut index = DbArtifactIndex::new(&mut conn, project_id.clone());
        let mut writer = VaultWriter::new(vault_root.path(), &mut index);
        let outcome = writer
            .write_note(&note(node_id.clone(), "wikilink"))
            .unwrap();
        assert!(matches!(outcome, WriteOutcome::Written { .. }));
    }

    // User modifies the file; the next write conflicts and keeps the bytes.
    let user_bytes = "my own edit\n";
    std::fs::write(&note_path, user_bytes).unwrap();
    let proposal = {
        let mut index = DbArtifactIndex::new(&mut conn, project_id.clone());
        let mut writer = VaultWriter::new(vault_root.path(), &mut index);
        match writer
            .write_note(&note(node_id.clone(), "wikilink"))
            .unwrap()
        {
            WriteOutcome::Conflict(proposal) => proposal,
            other => panic!("expected Conflict, got {other:?}"),
        }
    };
    assert_eq!(std::fs::read_to_string(&note_path).unwrap(), user_bytes);

    // KeepUser records the user baseline in SQLite.
    {
        let mut index = DbArtifactIndex::new(&mut conn, project_id.clone());
        let mut writer = VaultWriter::new(vault_root.path(), &mut index);
        writer.resolve(&proposal, Resolution::KeepUser).unwrap();
    }

    // Later regenerated content still refuses to overwrite silently.
    {
        let mut index = DbArtifactIndex::new(&mut conn, project_id.clone());
        let mut writer = VaultWriter::new(vault_root.path(), &mut index);
        let mut newer = note(node_id.clone(), "wikilink");
        newer.summary = "Regenerated.".into();
        let outcome = writer.write_note(&newer).unwrap();
        assert!(matches!(outcome, WriteOutcome::Conflict { .. }));
        assert_eq!(std::fs::read_to_string(&note_path).unwrap(), user_bytes);
    }

    // Explicit UseOurs finally replaces the file.
    {
        let mut index = DbArtifactIndex::new(&mut conn, project_id.clone());
        let mut writer = VaultWriter::new(vault_root.path(), &mut index);
        let outcome = writer.resolve(&proposal, Resolution::UseOurs).unwrap();
        assert!(matches!(outcome, WriteOutcome::Written { .. }));
    }
    assert!(std::fs::read_to_string(&note_path)
        .unwrap()
        .contains("Summary."));
}
