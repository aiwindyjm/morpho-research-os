# Prompt Architecture
Prompts live in `packages/prompts/{planner,search,extraction,entity,relation,validation,writing,synthesis}`. Each version declares input/output schema, model hints, safety constraints, and golden cases. Pipeline is LLM → parse → validate → normalize → persist.

The per-prompt metadata contract is frozen as [`packages/schemas/prompt-metadata.v1.json`](../../packages/schemas/prompt-metadata.v1.json); authoring rules, version discipline, cache-key participation, and golden case wiring are specified in [`packages/prompts/README.md`](../../packages/prompts/README.md).
