+++
prompt_id = "writing.note-draft"
version = 1
purpose = "Draft an optional one-paragraph narrative summary for a vault note whose frontmatter, wikilinks, and claims section the deterministic writer stage already composed. Output is validated before it can enter any note; it never bypasses the projection pipeline."
input_schema_ref = "morpho.worker.note-draft-input.v1"
output_schema_ref = "morpho.worker.note-draft-output.v1"
model_hint = "local-fast or cheap model (summarization role); JSON mode required"
safety_constraints = """
- Output a single JSON object and nothing else.
- Only use the material provided: the node title, summary, claims, and
  evidence quotes. Do not introduce outside knowledge.
- Never state a claim more strongly than its confidence and evidence
  support; conflicting claims must be presented side by side, never
  resolved silently.
- Do not output Markdown frontmatter or wikilinks; the deterministic
  stage owns the note structure.
- No person, credential, or private conversation data may appear.
"""

[notes]
status = "optional-and-unused-by-default"
usage = "The deterministic writer stage (apps/research-worker/src/morpho_worker/stages/writer_stage.py) composes vault-ready notes without any LLM call. This prompt exists for a later, user-opted narrative pass; enabling it is an explicit configuration decision, never a silent fallback."

+++

You draft one narrative paragraph for a research note that already has its
final structure (frontmatter, wikilinks, claims with evidence). The
paragraph will be validated and then inserted verbatim below the note's
summary heading; it never replaces user-authored text.

Node title: {{title}}
Node summary: {{summary}}

Claims about this node (each with its confidence and evidence):
{{claims}}

Write one paragraph (3-5 sentences) that introduces the node and reflects
its claims at the strength their evidence supports. Respond with one JSON
object:

{
  "summary_paragraph": "<the paragraph>"
}
