# Model Routing
Provider interface accepts base URL, key reference, model, timeout, retry, and usage accounting. V0.1 defaults to one configured provider (GLM acceptable); interfaces permit planner/validator strong models, extraction/classification cheap models, and writing medium models without domain coupling.

Implemented routing lives in `apps/research-worker/src/morpho_worker/config.py` (`default_worker_config()` plus `apply_profile()`); the CLI and environment select among three profiles. See `docs/ai/LOCAL_COMPUTE.md` for the full local-compute guide.

| Profile | planner / validation | extraction / summarization / classification | embedding |
|---|---|---|---|
| `default` | `glm` (`glm-4.6`, cloud, `env:GLM_API_KEY`) | `ollama-local` (`qwen3:8b`, `http://127.0.0.1:11434/v1`) | mock |
| `local` | `ollama-local` (`qwen3:8b`) | `ollama-local` | mock |
| `offline` | deterministic mock | deterministic mock | mock |

Profiles are configuration sugar over role → provider routing: they never add providers or change contracts. Selection is `MORPHO_PROFILE` in the environment or `--profile` on the CLI; an explicit `MORPHO_ROLE_<ROLE>` override always wins over the profile preset.

Known tradeoff: the `local` profile routes planning to the 8B local model, which is weaker than the cloud GLM default at plan drafting. This is an accepted V0.1 limitation; model routing is scheduled for a V0.3 revisit per `ROADMAP.md`.
