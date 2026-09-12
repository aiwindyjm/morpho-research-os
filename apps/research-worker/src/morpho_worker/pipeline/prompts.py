"""Prompt asset registry (draft; frozen by W2-04).

Prompt assets live in ``packages/prompts`` as versioned files::

    packages/prompts/<area>/<name>.v<version>.md

with a TOML frontmatter block (``+++`` delimited) declaring prompt id,
version, purpose, input/output schema references, model hints, and safety
constraints, followed by the template body. Templates use ``{{variable}}``
placeholders with strict substitution: missing variables are an error, so a
prompt can never silently render incomplete input.
"""

from __future__ import annotations

import os
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


@dataclass(frozen=True)
class PromptAsset:
    prompt_id: str
    version: int
    metadata: dict
    template: str

    @property
    def output_schema_ref(self) -> str:
        return str(self.metadata.get("output_schema_ref", ""))


def _default_prompts_dir() -> Path | None:
    if raw := os.environ.get("MORPHO_PROMPTS_DIR", ""):
        return Path(raw)
    for candidate in Path(__file__).resolve().parents:
        target = candidate / "packages" / "prompts"
        if target.is_dir():
            return target
    return None


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split ``+++toml+++`` frontmatter from the template body."""

    stripped = text.strip()
    if not stripped.startswith("+++"):
        raise ValueError("prompt asset is missing its +++ frontmatter block")
    end = stripped.find("+++", 3)
    if end < 0:
        raise ValueError("prompt asset frontmatter is not terminated")
    metadata = tomllib.loads(stripped[3:end].strip() or "{}")
    body = stripped[end + 3 :].strip()
    return metadata, body


def render_template(template: str, variables: dict[str, object]) -> str:
    """Strict ``{{variable}}`` substitution."""

    missing = sorted(
        {match for match in _PLACEHOLDER.findall(template) if match not in variables}
    )
    if missing:
        raise ValueError(f"missing template variables: {', '.join(missing)}")

    def substitute(match: re.Match[str]) -> str:
        return str(variables[match.group(1)])

    return _PLACEHOLDER.sub(substitute, template)


class PromptRegistry:
    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir or _default_prompts_dir()
        self._cache: dict[tuple[str, int], PromptAsset] = {}

    @property
    def base_dir(self) -> Path | None:
        return self._base_dir

    def asset_path(self, prompt_id: str, version: int = 1) -> Path:
        if self._base_dir is None:
            raise FileNotFoundError("prompt assets directory is not configured")
        area, _, name = prompt_id.rpartition(".")
        if not area or not name:
            raise ValueError(f"prompt id must look like '<area>.<name>': {prompt_id!r}")
        return self._base_dir / area / f"{name}.v{version}.md"

    def load(self, prompt_id: str, version: int = 1) -> PromptAsset:
        cache_key = (prompt_id, version)
        if cache_key in self._cache:
            return self._cache[cache_key]
        path = self.asset_path(prompt_id, version)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise FileNotFoundError(f"prompt asset not found: {path}") from exc
        metadata, template = parse_frontmatter(text)
        declared_id = str(metadata.get("prompt_id", prompt_id))
        if declared_id != prompt_id:
            raise ValueError(
                f"prompt asset {path} declares id {declared_id!r}, expected {prompt_id!r}"
            )
        declared_version = int(metadata.get("version", version))
        if declared_version != version:
            raise ValueError(
                f"prompt asset {path} declares version {declared_version}, expected {version}"
            )
        asset = PromptAsset(
            prompt_id=prompt_id, version=version, metadata=metadata, template=template
        )
        self._cache[cache_key] = asset
        return asset

    def render(
        self, prompt_id: str, variables: dict[str, object], version: int = 1
    ) -> tuple[PromptAsset, str]:
        """Load the asset and return it together with the rendered body."""

        asset = self.load(prompt_id, version)
        return asset, render_template(asset.template, variables)
