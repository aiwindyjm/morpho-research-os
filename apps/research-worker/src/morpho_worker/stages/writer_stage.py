"""Writer stage: vault-ready note projections (draft).

Builds Markdown note projections from a run's knowledge nodes, relations,
claims, and evidence (PRD section 10). The composition is deterministic -
no LLM call is required - so the stage is mock-friendly and idempotent by
construction: the same run material always produces byte-identical notes.

- Frontmatter carries exactly the PRD section 10 field set:
  ``schema_version``, ``node_id``, ``type``, ``title``, ``aliases``,
  ``tags``, ``confidence``, ``status``, ``source_ids``, ``claim_ids``,
  ``created_at``, ``updated_at``.
- The body renders a summary section, outgoing ``[[wikilinks]]`` generated
  from the run's relations (``[[target title]]`` for each outgoing edge),
  and a Claims section listing every claim about the node with its
  confidence, lifecycle status, and evidence locators (verbatim quote or
  section reference plus source id).
- ``tags`` derive deterministically from the node type.

The notes are *projections*: they are handed to the injected ResultSink and
never written to the filesystem by this worker. The optional LLM summary
paragraph prompt ``packages/prompts/writing/note-draft.v1.md`` (ADR-018
frontmatter) exists for a later, user-opted narrative pass and is unused by
this deterministic path.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.clock import Clock
from morpho_worker.domain.claims import Claim, Evidence
from morpho_worker.domain.knowledge import KnowledgeNode, Relation
from morpho_worker.providers.usage import utc_now_iso

#: Frontmatter keys exactly per PRD section 10 (order is the documented one).
FRONTMATTER_FIELDS: tuple[str, ...] = (
    "schema_version",
    "node_id",
    "type",
    "title",
    "aliases",
    "tags",
    "confidence",
    "status",
    "source_ids",
    "claim_ids",
    "created_at",
    "updated_at",
)

NOTE_SCHEMA_VERSION = "1.0"


class NoteProjection(BaseModel):
    """One vault-ready note: the PRD section 10 frontmatter plus a body."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = NOTE_SCHEMA_VERSION
    #: Vault note identity is the knowledge node identity (stable ids).
    node_id: str
    type: str
    title: str
    aliases: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    confidence: str = "unverified"
    status: str = "active"
    source_ids: list[str] = Field(default_factory=list)
    claim_ids: list[str] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    #: Rendered Markdown body (summary, wikilinks, claims with locators).
    body: str = ""

    def frontmatter(self) -> dict[str, object]:
        """The PRD section 10 field set, in documented order."""

        return {name: getattr(self, name) for name in FRONTMATTER_FIELDS}

    def render_markdown(self) -> str:
        """Full note text: YAML frontmatter block + body."""

        lines = ["---"]
        for name in FRONTMATTER_FIELDS:
            lines.append(f"{name}: {_yaml_value(getattr(self, name))}")
        lines.append("---")
        lines.append("")
        return "\n".join(lines) + self.body.rstrip("\n") + "\n"


def _yaml_value(value: object) -> str:
    """Minimal YAML scalar rendering for frontmatter values."""

    if isinstance(value, list):
        if not value:
            return "[]"
        return "[" + ", ".join(_yaml_scalar(item) for item in value) + "]"
    return _yaml_scalar(value)


def _yaml_scalar(value: object) -> str:
    text = str(value)
    safe = text and not any(ch in text for ch in ":#[]{}\"'&*!|>%@`,\n")
    return text if safe else "'" + text.replace("'", "''") + "'"


def wikilink(title: str) -> str:
    return f"[[{title}]]"


class WriterStage:
    """Deterministic note composer over a run's normalized material."""

    def build_notes(
        self,
        nodes: list[KnowledgeNode],
        relations: list[Relation],
        claims: list[Claim],
        evidence: list[Evidence],
        *,
        clock: Clock | None = None,
    ) -> list[NoteProjection]:
        now = clock.now_utc().isoformat() if clock else utc_now_iso()
        titles_by_node_id = {node.node_id: node.title for node in nodes}
        evidence_by_id = {item.evidence_id: item for item in evidence}
        claims_by_subject: dict[str, list[Claim]] = {}
        for claim in sorted(claims, key=lambda c: c.claim_id):
            claims_by_subject.setdefault(claim.subject_node_id, []).append(claim)
        outgoing: dict[str, list[Relation]] = {}
        for relation in sorted(relations, key=lambda r: r.relation_id):
            outgoing.setdefault(relation.subject_node_id, []).append(relation)

        notes: list[NoteProjection] = []
        for node in sorted(nodes, key=lambda n: n.node_id):
            node_claims = claims_by_subject.get(node.node_id, [])
            claim_ids = list(node.claim_ids)
            for claim in node_claims:
                if claim.claim_id not in claim_ids:
                    claim_ids.append(claim.claim_id)
            notes.append(
                NoteProjection(
                    schema_version=NOTE_SCHEMA_VERSION,
                    node_id=node.node_id,
                    type=node.type.value,
                    title=node.title,
                    aliases=list(node.aliases),
                    tags=[node.type.value],
                    confidence=node.confidence.value,
                    status=node.status.value,
                    source_ids=list(node.source_ids),
                    claim_ids=claim_ids,
                    created_at=node.created_at or now,
                    updated_at=node.updated_at or now,
                    body=self._render_body(
                        node, titles_by_node_id, outgoing, node_claims, evidence_by_id
                    ),
                )
            )
        return notes

    def _render_body(
        self,
        node: KnowledgeNode,
        titles_by_node_id: dict[str, str],
        outgoing: dict[str, list[Relation]],
        node_claims: list[Claim],
        evidence_by_id: dict[str, Evidence],
    ) -> str:
        sections: list[str] = []
        if node.summary:
            sections.append(f"## Summary\n\n{node.summary}\n")

        links: list[str] = []
        for relation in outgoing.get(node.node_id, []):
            target_title = titles_by_node_id.get(relation.object_node_id)
            if target_title is None:
                continue
            links.append(f"- {wikilink(target_title)} ({relation.predicate})")
        if links:
            sections.append("## Related\n\n" + "\n".join(links) + "\n")

        claim_lines: list[str] = []
        for claim in node_claims:
            claim_lines.append(
                f"- **{claim.predicate}**: {claim.object_value} "
                f"(confidence: {claim.confidence.value}, status: {claim.status.value})"
            )
            for evidence_id in claim.evidence_ids:
                evidence = evidence_by_id.get(evidence_id)
                if evidence is None:
                    continue
                locator = evidence.locator
                where = locator.quote or locator.section or locator.url_fragment
                if where:
                    direction = evidence.direction.value
                    claim_lines.append(f"  - [{direction}] {where} ({evidence.source_id})")
        if claim_lines:
            sections.append("## Claims\n\n" + "\n".join(claim_lines) + "\n")

        return "\n".join(sections)
