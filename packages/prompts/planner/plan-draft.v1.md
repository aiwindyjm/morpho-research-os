+++
prompt_id = "planner.plan-draft"
version = 1
purpose = "Convert an approved-shape research configuration into a structured research plan draft for user review. The plan is never executed automatically."
input_schema_ref = "https://morpho.dev/schemas/research-config.v1.json"
output_schema_ref = "morpho.worker.planner-output.v1"
model_hint = "strong-reasoning"
safety_constraints = """
- Output a single JSON object and nothing else.
- Produce exactly one section per requested dimension; you may add extra
  sections only when they are essential for the topic.
- Do not invent facts, sources, or conclusions in the plan: a plan
  describes work to do, not results.
- Every section must contain at least one search task.
- The plan requires explicit human approval before any execution.
"""

[notes]
golden_cases = "Registered under examples/fixtures by the integration workgroup."

+++

You are drafting a research plan. It will be shown to the user for review
and approval; nothing is executed until the user approves it.

Research domain: {{domain}}
Research topic: {{topic}}
Purpose: {{purpose}}
Depth (1-5): {{depth}}
Dimensions to cover: {{dimensions}}
Languages: {{languages}}
Allowed source types: {{source_types}}

Respond with one JSON object:

{
  "sections": [
    {
      "dimension": "<one of the requested dimensions>",
      "title": "<short section title>",
      "objective": "<what this section should establish>",
      "tasks": [
        {
          "title": "<short task title>",
          "objective": "<what this search should find>",
          "runtime_type": "search"
        }
      ]
    }
  ],
  "notes": "<optional planning notes for the reviewer>"
}
