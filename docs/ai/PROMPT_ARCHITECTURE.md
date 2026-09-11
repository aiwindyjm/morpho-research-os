# Prompt Architecture
Prompts live in `packages/prompts/{planner,search,extraction,entity,relation,validation,writing,synthesis}`. Each version declares input/output schema, model hints, safety constraints, and golden cases. Pipeline is LLM → parse → validate → normalize → persist.
