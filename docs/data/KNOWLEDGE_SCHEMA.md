# Knowledge Schema
KnowledgeNode has structured common fields (id, type, title, aliases, summary, confidence, status, timestamps) plus bounded type metadata. Types include Concept, Person, Organization, Company, Paper, Book, Experiment, Event, Technology, Product, Application, Policy, Dataset, Controversy. Claims and Evidence are separate records.

Frozen contract: [`packages/schemas/knowledge-node.v1.json`](../../packages/schemas/knowledge-node.v1.json). The 14 type values and the six-state `confidence` (`confirmed`/`high`/`medium`/`low`/`unverified`/`conflicting`) are enums; `metadata` is the only open JSON block, bounded by this specification per type. `node_id` is the stable identifier the vault note frontmatter must match.
