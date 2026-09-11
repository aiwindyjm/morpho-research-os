# GitHub Workflow

Issue/Discussion → triage → milestone → feature or page spec → implementation → tests → PR → review → merge → release notes → changelog. Use labels `type:*`, `area:*`, `priority:*`, and `status:*`. Keep one canonical issue per problem and link PRs with `Fixes #ID`.

Develop in small, independently reviewable increments. Public commits and releases describe real completed work. The maintainer may keep local batching, release timing, and personal execution notes in `private/`; those files are ignored and must never be referenced as public project history.

AI may prepare commits and PRs for scoped, reversible changes. Human review is mandatory for architecture, schemas, security, secrets, migrations, provider adapters, and releases.
