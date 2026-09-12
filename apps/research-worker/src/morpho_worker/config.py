"""Worker configuration boundary.

Rules enforced here (workgroup D / PY-01):

- Configuration carries only *key references* (``env:NAME`` or
  ``keychain:NAME``), never raw API keys. The validator rejects values that
  are not references, so a pasted secret cannot be smuggled into config.
- Secret *values* are resolved only at provider call time via
  :func:`resolve_key_reference` and are never stored on the config object,
  logged, or persisted by the worker.
- Provider ids and model names are configuration, never domain enums.
"""

from __future__ import annotations

from enum import Enum
from typing import Mapping

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_KEY_REFERENCE_PATTERN = r"^$|^(env|keychain):[A-Za-z0-9_.\-]+$"
_PROVIDER_ID_PATTERN = r"^[a-z0-9][a-z0-9-]*$"


class ProviderKind(str, Enum):
    LLM = "llm"
    SEARCH = "search"
    EMBEDDING = "embedding"


class ProviderConfig(BaseModel):
    """One provider endpoint. Provider/model are config, not domain enums."""

    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(pattern=_PROVIDER_ID_PATTERN)
    kind: ProviderKind
    base_url: str = ""
    #: Reference only: ``env:NAME`` or ``keychain:NAME``. Empty means the
    #: provider needs no credential (for example a local Ollama endpoint).
    key_reference: str = Field(default="", pattern=_KEY_REFERENCE_PATTERN)
    model: str = ""
    timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    max_retries: int = Field(default=2, ge=0, le=10)
    retry_backoff_seconds: float = Field(default=1.0, ge=0, le=60)
    #: Optional explicit pricing used to compute ``estimated_cost`` on usage
    #: records. None means cost is unknown, never zero.
    cost_per_1k_input: float | None = Field(default=None, ge=0)
    cost_per_1k_output: float | None = Field(default=None, ge=0)


class ProviderRole(str, Enum):
    PLANNER = "planner"
    VALIDATION = "validation"
    EXTRACTION = "extraction"
    SUMMARIZATION = "summarization"
    CLASSIFICATION = "classification"
    EMBEDDING = "embedding"


class ProviderRoles(BaseModel):
    """Role → provider_id routing. Frozen formally by W2-03.

    ``"mock"`` is the reserved id for the deterministic offline adapter.
    """

    model_config = ConfigDict(extra="forbid")

    planner: str = "mock"
    validation: str = "mock"
    extraction: str = "mock"
    summarization: str = "mock"
    classification: str = "mock"
    embedding: str = "mock"


class WorkerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config_schema_version: str = "1"
    #: Offline mock mode: run the full pipeline with deterministic mock
    #: providers and no network. This is the default for tests.
    offline_mock: bool = False
    providers: dict[str, ProviderConfig] = Field(default_factory=dict)
    roles: ProviderRoles = Field(default_factory=ProviderRoles)
    max_concurrency: int = Field(default=2, ge=1, le=16)
    #: Directory containing packages/prompts assets. Resolved relative to the
    #: repository when running from source; the Rust supervisor sets
    #: MORPHO_PROMPTS_DIR in packaged deployments.
    prompts_dir: str | None = None

    @model_validator(mode="after")
    def _roles_resolve(self) -> "WorkerConfig":
        for role in ProviderRole:
            provider_id = getattr(self.roles, role.value)
            if provider_id != "mock" and provider_id not in self.providers:
                raise ValueError(
                    f"role {role.value} references provider {provider_id!r} "
                    "which is not configured"
                )
        return self

    def provider_for(self, role: ProviderRole) -> ProviderConfig | None:
        provider_id = getattr(self.roles, role.value)
        if provider_id == "mock":
            return None
        return self.providers[provider_id]


def default_worker_config() -> WorkerConfig:
    """Documented default routing for the maintainer's machine.

    Per the workgroup D prompt: extraction/summarization/classification run on
    a local Ollama model (qwen3:8b, qwen2.5:7b fallback); planner/validation
    run on a strong OpenAI-compatible model (GLM); embeddings stay on a
    replaceable mock in V0.1. Everything here is a *default* and is
    overridable through environment variables.
    """

    return WorkerConfig(
        offline_mock=False,
        providers={
            "ollama-local": ProviderConfig(
                provider_id="ollama-local",
                kind=ProviderKind.LLM,
                base_url="http://127.0.0.1:11434/v1",
                key_reference="",
                model="qwen3:8b",
            ),
            "ollama-local-fallback": ProviderConfig(
                provider_id="ollama-local-fallback",
                kind=ProviderKind.LLM,
                base_url="http://127.0.0.1:11434/v1",
                key_reference="",
                model="qwen2.5:7b",
            ),
            "glm": ProviderConfig(
                provider_id="glm",
                kind=ProviderKind.LLM,
                base_url="https://open.bigmodel.cn/api/paas/v4",
                key_reference="env:GLM_API_KEY",
                model="glm-4.6",
                timeout_seconds=120.0,
                max_retries=2,
            ),
        },
        roles=ProviderRoles(
            planner="glm",
            validation="glm",
            extraction="ollama-local",
            summarization="ollama-local",
            classification="ollama-local",
            embedding="mock",
        ),
    )


def apply_profile(config: WorkerConfig, profile: str) -> WorkerConfig:
    """Routing presets. Profiles are configuration sugar over ProviderRoles;
    they never add providers or change contracts."""

    profile = (profile or "default").strip().lower()
    if profile in {"", "default"}:
        return config
    if profile == "offline":
        return config.model_copy(update={"offline_mock": True})
    if profile == "local":
        return config.model_copy(update={
            "offline_mock": False,
            "roles": config.roles.model_copy(update={
                role: "ollama-local" for role in
                ("planner", "validation", "extraction", "summarization", "classification")
            }),
        })
    raise ValueError(f"unknown profile: {profile!r}")


_PROVIDER_ENV_PREFIX = "MORPHO_PROVIDER_"
_PROVIDER_ENV_FIELDS = ("BASE_URL", "KEY_REF", "KIND", "MODEL", "RETRIES", "TIMEOUT")


def _split_provider_env(name: str) -> tuple[str, str] | None:
    """``MORPHO_PROVIDER_OLLAMA_LOCAL_MODEL`` → ``("ollama-local", "MODEL")``.

    Provider ids use hyphens; environment names use underscores, so the
    provider segment is lower-cased and underscores become hyphens.
    """

    if not name.startswith(_PROVIDER_ENV_PREFIX):
        return None
    rest = name[len(_PROVIDER_ENV_PREFIX) :]
    for field in _PROVIDER_ENV_FIELDS:
        suffix = "_" + field
        if rest.endswith(suffix) and len(rest) > len(suffix):
            provider_segment = rest[: -len(suffix)]
            return provider_segment.lower().replace("_", "-"), field
    return None


def from_env(
    env: Mapping[str, str], base: WorkerConfig | None = None
) -> WorkerConfig:
    """Build a config from environment variables (draft names, frozen by the
    supervisor contract). Missing variables keep their defaults.

    Recognized variables::

        MORPHO_WORKER_OFFLINE=1
        MORPHO_MAX_CONCURRENCY=2
        MORPHO_PROMPTS_DIR=/path/to/packages/prompts
        MORPHO_PROVIDER_<NAME>_KIND=llm|search|embedding
        MORPHO_PROVIDER_<NAME>_BASE_URL=https://...
        MORPHO_PROVIDER_<NAME>_MODEL=model-name
        MORPHO_PROVIDER_<NAME>_KEY_REF=env:NAME     (reference, never a value)
        MORPHO_PROVIDER_<NAME>_TIMEOUT=120
        MORPHO_PROVIDER_<NAME>_RETRIES=2
        MORPHO_ROLE_<ROLE>=<provider-name>
        MORPHO_PROFILE=local|offline|default

    ``MORPHO_PROFILE`` is applied before the explicit ``MORPHO_ROLE_<ROLE>``
    overrides, so a per-role environment variable still wins over the
    profile's routing preset.
    """

    config = base if base is not None else default_worker_config()

    data = config.model_dump()
    if env.get("MORPHO_WORKER_OFFLINE", "").strip().lower() in {"1", "true", "yes"}:
        data["offline_mock"] = True
    if raw := env.get("MORPHO_MAX_CONCURRENCY", ""):
        data["max_concurrency"] = int(raw)
    if raw := env.get("MORPHO_PROMPTS_DIR", ""):
        data["prompts_dir"] = raw

    provider_fields: dict[str, dict[str, str]] = {}
    for name, value in env.items():
        parsed = _split_provider_env(name)
        if parsed is None:
            continue
        provider_id, field = parsed
        provider_fields.setdefault(provider_id, {})[field] = value.strip()

    providers: dict[str, dict] = dict(data["providers"])
    for provider_id in sorted(provider_fields):
        fields = provider_fields[provider_id]
        entry = providers.setdefault(
            provider_id,
            {
                "provider_id": provider_id,
                "kind": "llm",
                "base_url": "",
                "key_reference": "",
                "model": "",
                "timeout_seconds": 60.0,
                "max_retries": 2,
                "retry_backoff_seconds": 1.0,
                "cost_per_1k_input": None,
                "cost_per_1k_output": None,
            },
        )
        if raw := fields.get("KIND", ""):
            entry["kind"] = raw.lower()
        if raw := fields.get("BASE_URL", ""):
            entry["base_url"] = raw
        if raw := fields.get("MODEL", ""):
            entry["model"] = raw
        if raw := fields.get("KEY_REF", ""):
            entry["key_reference"] = raw
        if raw := fields.get("TIMEOUT", ""):
            entry["timeout_seconds"] = float(raw)
        if raw := fields.get("RETRIES", ""):
            entry["max_retries"] = int(raw)
    data["providers"] = providers

    # Profile first, explicit MORPHO_ROLE_* on top: the per-role override
    # always wins over the preset.
    if raw := env.get("MORPHO_PROFILE", ""):
        data = apply_profile(WorkerConfig.model_validate(data), raw).model_dump()

    for role in ProviderRole:
        key = f"MORPHO_ROLE_{role.value.upper()}"
        if raw := env.get(key, ""):
            data["roles"][role.value] = raw.strip()

    return WorkerConfig.model_validate(data)


def resolve_key_reference(
    key_reference: str, env: Mapping[str, str]
) -> str | None:
    """Resolve a key reference to its secret value at call time only.

    - ``env:NAME`` reads ``NAME`` from the provided environment mapping.
    - ``keychain:NAME`` cannot be resolved by the worker itself; the OS
      keychain belongs to the Rust core, so this returns None and the caller
      must surface a clear configuration error instead of guessing.
    - An empty reference means the provider needs no credential (local
      Ollama) and also returns None.

    Values are never cached, logged, or attached to configuration.
    """

    reference = key_reference.strip()
    if not reference:
        return None
    scheme, _, name = reference.partition(":")
    if scheme == "env" and name:
        return env.get(name)
    # keychain: reference - resolution is delegated to the Rust core.
    return None
