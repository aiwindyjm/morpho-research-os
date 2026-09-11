# Morpho HTML Prototype

This is a static product prototype. It is intentionally separate from the future React/Tauri implementation and contains no production data layer.

Open `index.html` directly in a browser. The prototype demonstrates the minimum research workflow:

1. Open **我的研究** and switch between multiple independent research projects.
2. Create or configure a research project.
3. Review and approve a generated plan.
4. Inspect resumable research tasks.
5. Browse sources and normalized knowledge.
6. Inspect a 2D knowledge graph.
7. Save and explicitly download a private daily conversation journal.

The journal uses browser `localStorage`. Downloaded Markdown/JSON files should be placed in `private/conversations/`; that directory is ignored by Git. The production app will replace this browser behavior with Rust Core daily file writes.
