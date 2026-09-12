"""Incremental research diffing (PRD section 14, draft).

Each research run fingerprints its canonical sources and normalized claims;
comparing a completed run against the prior completed run's snapshot
classifies every source and claim as new, changed, or conflicting:

- **sources** are identified by ``url_dedup_key`` and fingerprinted by their
  content hash (:class:`~morpho_worker.domain.source.SourceContent`).
  A source is *new* when its dedup key is absent from the baseline,
  *changed* when the key is known but the content fingerprint differs.
- **claims** are identified by their deterministic claim id and
  fingerprinted over their normalized content (subject, predicate, object,
  scope, confidence, evidence ids), so merged evidence across runs counts
  as a change. A claim is *new* when its id is absent from the baseline and
  *changed* when the id is known but the fingerprint differs.
- **conflicting** preserves the existing conflict semantics (claim.v1.1):
  a current claim whose ``(subject_node_id, predicate)`` matches a prior
  claim with a *different* object value conflicts with that prior claim,
  and a claim the current run itself marked ``confidence=conflicting``
  conflicts within the run. A conflicting source is one whose extracted
  evidence backs a conflicting claim.

Each record lands in exactly one bucket. Classification precedence is
``conflicting > new > changed``: a contradicting claim always has a
different object value and therefore a fresh deterministic id, so without
this precedence every conflict would silently classify as new; the same
argument applies to sources backing conflicting material.

Records with unchanged fingerprints are counted but not itemized. With no
prior run the baseline is empty: everything is new and nothing can be
changed or conflicting. The :class:`IncrementalReport` is persisted through
the injected ``ResultSink`` (record type ``incremental-report``) so the Rust
core can store it like any other run artifact; the orchestrator also emits
a ``run.incremental_report`` event with the summary counts.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.domain.claims import Claim, ClaimConfidence
from morpho_worker.domain.source import Source, SourceContent
from morpho_worker.ids import canonical_json, content_fingerprint
from morpho_worker.providers.usage import utc_now_iso


def source_fingerprint(source: Source, contents: list[SourceContent]) -> str:
    """Fingerprint one source over its content hash (content preferred,
    canonical URL as fallback when no content record exists yet)."""

    for content in contents:
        if content.source_id == source.source_id:
            return content.fingerprint
    return content_fingerprint(source.canonical_url)


def claim_fingerprint(claim: Claim) -> str:
    """Fingerprint one normalized claim over its persisted content.

    Evidence ids are included (sorted by the canonical JSON encoding), so
    accumulating evidence across runs is a change; the lifecycle-only
    ``status`` and ``review_state`` fields are deliberately excluded - a
    review decision is not new research material."""

    return content_fingerprint(
        canonical_json(
            {
                "subject_node_id": claim.subject_node_id,
                "predicate": claim.predicate.casefold(),
                "object_value": claim.object_value.casefold(),
                "scope": claim.scope,
                "confidence": claim.confidence.value,
                "evidence_ids": sorted(claim.evidence_ids),
            }
        )
    )


class IncrementalBaseline(BaseModel):
    """Snapshot of one completed run used as the comparison baseline."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    project_id: str = ""
    #: url_dedup_key -> content fingerprint.
    sources: dict[str, str] = Field(default_factory=dict)
    #: claim_id -> content fingerprint.
    claims: dict[str, str] = Field(default_factory=dict)
    #: claim_id -> (subject_node_id, predicate, object_value) for conflict
    #: detection against prior assertions.
    claim_keys: dict[str, tuple[str, str, str]] = Field(default_factory=dict)

    @classmethod
    def from_run(
        cls,
        run_id: str,
        *,
        project_id: str = "",
        sources: list[Source],
        contents: list[SourceContent],
        claims: list[Claim],
    ) -> "IncrementalBaseline":
        return cls(
            run_id=run_id,
            project_id=project_id,
            sources={
                source.url_dedup_key: source_fingerprint(source, contents)
                for source in sources
            },
            claims={claim.claim_id: claim_fingerprint(claim) for claim in claims},
            claim_keys={
                claim.claim_id: (
                    claim.subject_node_id,
                    claim.predicate.casefold(),
                    claim.object_value.casefold(),
                )
                for claim in claims
            },
        )


class SourceEntry(BaseModel):
    """One itemized source in an incremental report."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    url_dedup_key: str
    fingerprint: str = ""
    prior_fingerprint: str = ""


class ClaimEntry(BaseModel):
    """One itemized claim in an incremental report."""

    model_config = ConfigDict(extra="forbid")

    claim_id: str
    subject_node_id: str = ""
    predicate: str = ""
    #: The baseline claim this record conflicts with (within-run conflicts
    #: carry no prior claim id).
    prior_claim_id: str | None = None


class IncrementalReport(BaseModel):
    """Diff of one completed run against the prior completed run.

    Persisted through the ResultSink as record type ``incremental-report``
    (identity field: ``run_id``); the core stores it like any other run
    artifact.
    """

    model_config = ConfigDict(extra="forbid")

    run_id: str
    project_id: str = ""
    prior_run_id: str | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    sources_new: list[SourceEntry] = Field(default_factory=list)
    sources_changed: list[SourceEntry] = Field(default_factory=list)
    sources_conflicting: list[SourceEntry] = Field(default_factory=list)
    claims_new: list[ClaimEntry] = Field(default_factory=list)
    claims_changed: list[ClaimEntry] = Field(default_factory=list)
    claims_conflicting: list[ClaimEntry] = Field(default_factory=list)
    computed_at: str = ""

    def summary(self) -> dict[str, int | str | None]:
        """Compact summary for events and run results."""

        return {
            "run_id": self.run_id,
            "prior_run_id": self.prior_run_id,
            **self.counts,
        }


def compute_incremental_report(
    *,
    run_id: str,
    project_id: str = "",
    prior: IncrementalBaseline | None,
    sources: list[Source],
    contents: list[SourceContent],
    claims: list[Claim],
    evidence_sources_by_claim: dict[str, list[str]] | None = None,
    computed_at: str = "",
) -> IncrementalReport:
    """Classify a completed run's records against the prior baseline.

    ``evidence_sources_by_claim`` maps claim id -> contributing source ids
    (derivable from the run's evidence records); it drives the
    conflicting-source bucket. Claims already marked
    ``confidence=conflicting`` by the run's validation conflict within the
    run even without a contradicting baseline claim.
    """

    evidence_sources_by_claim = evidence_sources_by_claim or {}
    # Within-run conflicts (existing conflict marking, claim.v1.1).
    conflicting: dict[str, ClaimEntry] = {}
    for claim in claims:
        if claim.confidence is ClaimConfidence.CONFLICTING:
            conflicting[claim.claim_id] = ClaimEntry(
                claim_id=claim.claim_id,
                subject_node_id=claim.subject_node_id,
                predicate=claim.predicate,
                prior_claim_id=None,
            )
    # Cross-run conflicts: same (subject, predicate), different object.
    if prior is not None:
        for claim in claims:
            if claim.claim_id in conflicting:
                continue
            for prior_id, key in prior.claim_keys.items():
                subject, predicate, object_value = key
                if (
                    claim.subject_node_id == subject
                    and claim.predicate.casefold() == predicate
                    and claim.object_value.casefold() != object_value
                ):
                    conflicting[claim.claim_id] = ClaimEntry(
                        claim_id=claim.claim_id,
                        subject_node_id=claim.subject_node_id,
                        predicate=claim.predicate,
                        prior_claim_id=prior_id,
                    )
                    break

    sources_conflicting_ids: set[str] = set()
    for claim_id in conflicting:
        for source_id in evidence_sources_by_claim.get(claim_id, []):
            sources_conflicting_ids.add(source_id)

    sources_new: list[SourceEntry] = []
    sources_changed: list[SourceEntry] = []
    sources_conflicting: list[SourceEntry] = []
    sources_unchanged = 0
    for source in sources:
        fingerprint = source_fingerprint(source, contents)
        entry = SourceEntry(
            source_id=source.source_id,
            url_dedup_key=source.url_dedup_key,
            fingerprint=fingerprint,
        )
        if source.source_id in sources_conflicting_ids:
            sources_conflicting.append(entry)
        elif source.url_dedup_key not in (prior.sources if prior else {}):
            sources_new.append(entry)
        elif prior and prior.sources.get(source.url_dedup_key) != fingerprint:
            entry.prior_fingerprint = prior.sources.get(source.url_dedup_key, "")
            sources_changed.append(entry)
        else:
            sources_unchanged += 1

    claims_new: list[ClaimEntry] = []
    claims_changed: list[ClaimEntry] = []
    claims_unchanged = 0
    for claim in claims:
        entry = ClaimEntry(
            claim_id=claim.claim_id,
            subject_node_id=claim.subject_node_id,
            predicate=claim.predicate,
        )
        if claim.claim_id in conflicting:
            continue  # already itemized with its prior claim id
        if claim.claim_id not in (prior.claims if prior else {}):
            claims_new.append(entry)
        elif prior and prior.claims.get(claim.claim_id) != claim_fingerprint(claim):
            claims_changed.append(entry)
        else:
            claims_unchanged += 1

    claim_entries_conflicting = [
        conflicting[claim.claim_id] for claim in claims if claim.claim_id in conflicting
    ]
    return IncrementalReport(
        run_id=run_id,
        project_id=project_id,
        prior_run_id=prior.run_id if prior is not None else None,
        counts={
            "sources_total": len(sources),
            "sources_new": len(sources_new),
            "sources_changed": len(sources_changed),
            "sources_conflicting": len(sources_conflicting),
            "sources_unchanged": sources_unchanged,
            "claims_total": len(claims),
            "claims_new": len(claims_new),
            "claims_changed": len(claims_changed),
            "claims_conflicting": len(claim_entries_conflicting),
            "claims_unchanged": claims_unchanged,
        },
        sources_new=sources_new,
        sources_changed=sources_changed,
        sources_conflicting=sources_conflicting,
        claims_new=claims_new,
        claims_changed=claims_changed,
        claims_conflicting=claim_entries_conflicting,
        computed_at=computed_at or utc_now_iso(),
    )
