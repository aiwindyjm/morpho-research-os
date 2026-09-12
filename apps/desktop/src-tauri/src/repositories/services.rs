//! Domain services: the only layer allowed to compose repositories inside
//! transactions. Commands call services; services own units of work.

use crate::error::CoreError;
use crate::repositories::configs::{NewResearchConfig, ResearchConfigRecord, ResearchConfigs};
use crate::repositories::events::{EventRecord, Events, NewEvent};
use crate::repositories::plans::{CreatedPlan, PlanDraft, Plans};
use crate::repositories::projects::{NewProject, ProjectRecord, Projects};
use rusqlite::Connection;

pub struct ProjectService;

impl ProjectService {
    /// Creates a project together with its first research configuration in
    /// one transaction; a failure persists neither.
    pub fn create_project_with_config(
        conn: &mut Connection,
        new_project: NewProject,
        config: NewResearchConfig,
    ) -> Result<(ProjectRecord, ResearchConfigRecord), CoreError> {
        crate::repositories::with_write_tx(conn, |tx| {
            let project = Projects::insert(tx, &new_project)?;
            let mut config = config;
            config.project_id = project.id.clone();
            let record = ResearchConfigs::insert(tx, &config)?;
            Ok((project, record))
        })
    }
}

pub struct PlanService;

impl PlanService {
    /// Persists a full plan draft (plan + sections + tasks + dependencies)
    /// atomically. Idempotency keys are unique; duplicates reject the whole
    /// draft without partial writes.
    pub fn create_plan(conn: &mut Connection, draft: PlanDraft) -> Result<CreatedPlan, CoreError> {
        crate::repositories::with_write_tx(conn, |tx| Plans::insert_draft(tx, &draft))
    }
}

pub struct EventService;

impl EventService {
    /// Appends one run event, allocating its sequence atomically: the
    /// sequence lookup and the insert share one write transaction, so two
    /// appends can never observe the same `MAX(sequence)`.
    pub fn append_event(conn: &mut Connection, new: NewEvent) -> Result<EventRecord, CoreError> {
        crate::repositories::with_write_tx(conn, |tx| Events::append(tx, &new))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::NewResearchConfig;
    use crate::repositories::events::Events;
    use crate::repositories::plans::{NewPlan, PlanDraft};
    use crate::repositories::runs::{NewRun, Runs};
    use crate::repositories::with_write_tx;

    #[test]
    fn project_and_config_commit_or_rollback_together() {
        let mut conn = migrated_memory_db().unwrap();
        let config = NewResearchConfig {
            project_id: "will-be-overwritten".into(),
            domain: "d".into(),
            topic: "t".into(),
            ..Default::default()
        };
        let (project, stored_config) = ProjectService::create_project_with_config(
            &mut conn,
            NewProject {
                name: "BCI".into(),
                description: String::new(),
            },
            config,
        )
        .unwrap();
        assert_eq!(stored_config.project_id, project.id);
        assert_eq!(
            ResearchConfigs::list_for_project(&conn, &project.id)
                .unwrap()
                .len(),
            1
        );

        // A config pointing at a missing project fails and writes nothing.
        let bad = NewResearchConfig {
            project_id: "ghost".into(),
            domain: "d".into(),
            topic: "t".into(),
            ..Default::default()
        };
        let err = crate::repositories::with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(tx, &bad).map(|_| ())
        })
        .unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DatabaseError);
        let projects: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(projects, 1);
    }

    #[test]
    fn appended_events_allocate_monotonic_sequences_per_service_call() {
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
        let config_id = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    domain: "d".into(),
                    topic: "t".into(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let plan_id = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                    },
                    sections: vec![],
                    tasks: vec![],
                },
            )
            .map(|created| created.plan.id)
        })
        .unwrap();
        let run_id = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id,
                    started_at: None,
                },
            )
            .map(|r| r.id)
        })
        .unwrap();

        for expected in 1..=2 {
            let record = EventService::append_event(
                &mut conn,
                NewEvent {
                    run_id: run_id.clone(),
                    task_id: None,
                    event_type: "run.progress".into(),
                    payload: "{}".into(),
                },
            )
            .unwrap();
            assert_eq!(record.sequence, expected);
        }
        assert_eq!(Events::latest_sequence(&conn, &run_id).unwrap(), 2);
    }
}
