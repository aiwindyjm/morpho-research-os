# Data Model

Project 1—N ResearchConfig; Plan 1—N Sections and Tasks; Task N—N TaskDependency; Run 1—N Tasks; Source 1—N SourceContent; Claim N—N Evidence; Evidence N—1 Source; KnowledgeNode N—N Relation; Artifact N—1 Project; Event N—1 Run; LLMUsage N—1 Task.

SQLite stores normalized runtime/index state. UUIDv7 strings, UTC timestamps, foreign keys, and indexes on project/run/state/canonical URL/endpoints are mandatory. JSON is limited to provider payload metadata, task parameters, typed node metadata, and event details. Markdown stores durable user knowledge and frontmatter; cache stores replaceable fetch/LLM data; logs store operational data.
