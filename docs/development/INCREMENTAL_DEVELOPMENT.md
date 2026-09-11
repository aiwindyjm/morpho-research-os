# Incremental Development

Morpho is developed as a sequence of small, meaningful slices. A slice is the smallest change that can be understood, tested, and reviewed independently.

## Slice rules

- One slice has one primary outcome.
- Define acceptance checks before implementation.
- Prefer one contract, one narrow implementation, and one focused test group per slice.
- Keep a slice revertible where practical.
- Do not combine unrelated UI, schema, provider, and documentation work just to make a larger release.
- A slice may remain local until it is ready for public review.

## Public version meaning

Public versions describe shipped capability, not private work sessions:

| Version family | Meaning |
|---|---|
| `0.0.x` | Foundation, contracts, prototypes, and experimental slices |
| `0.1.0` | First complete local research workflow |
| `0.1.x` | Compatible fixes and small improvements |
| `0.2.0` | Claims, evidence, validation, conflicts, and richer sources |
| `1.0.0` | Stable contracts, migrations, Vault preservation, and upgrade path |

Do not create a release only because a private batch is complete. Release when the public behavior, tests, documentation, and known limitations are ready to explain.

## Private schedule boundary

The maintainer may decide locally which slices to implement first, group together, delay, or publish at different times. That schedule belongs in ignored files under `private/`. Public Git history contains only the truthful record of changes that were actually committed and pushed; it must not contain the private schedule, personal notes, or unpublished batch plan.

Actual commit timestamps are an unavoidable property of Git once commits are published. The rule protects the schedule and planning notes, not the factual timestamp of a public change.

## Definition of done

A slice is ready for public commit when its governing documents are known, acceptance checks pass, the diff is reviewed, private files are absent from the staged set, and the commit message states the real outcome. A release additionally needs release notes, changelog entry, version consistency, and a demonstrable user-facing story.
