+++
prompt_id = "extraction.source-extraction"
version = 1
purpose = "Extract structured entities, relations, claims, and a summary from one source document. Output is validated and normalized before persistence; nothing is written directly."
input_schema_ref = "morpho.worker.extraction-input.v1"
output_schema_ref = "morpho.worker.extraction-output.v1"
model_hint = "local-fast or cheap model (extraction role); JSON mode required"
safety_constraints = """
- Output a single JSON object and nothing else.
- Only extract what the source text actually supports; do not invent
  entities, relations, or claims.
- Every claim must carry a verbatim quote or a precise section reference
  from the source text.
- Confidence reflects how clearly the source states the item, not truth.
- Keep names exactly as written in the source; put spelling variants into
  aliases.
"""

[notes]
golden_cases = "Registered under examples/fixtures by the integration workgroup."

+++

You extract structured research material from one source. The result is
validated against a schema; malformed output is retried and finally
rejected. The extraction is keyed by the content fingerprint: the same
text always yields the same extraction, regardless of where it was
published or which research dimension asked for it.

Research topic: {{topic}}

Source content (may be truncated):
{{content}}

Respond with one JSON object:

{
  "entities": [
    {
      "name": "<entity name as written>",
      "type": "concept|person|organization|company|paper|book|experiment|event|technology|product|application|policy|dataset|controversy",
      "aliases": ["<spelling variants>"],
      "description": "<one-sentence description grounded in the source>"
    }
  ],
  "relations": [
    {
      "subject": "<entity name>",
      "predicate": "<typed verb phrase, e.g. cites|uses|founded|supports>",
      "object": "<entity name>",
      "confidence": 0.0
    }
  ],
  "claims": [
    {
      "subject": "<entity name>",
      "predicate": "<claim predicate>",
      "object_value": "<the asserted value or object>",
      "quote": "<verbatim quote from the source>",
      "section": "<optional section heading>",
      "confidence": 0.0
    }
  ],
  "summary": "<three-sentence summary of the source for this dimension>",
  "key_points": ["<short point>"]
}
