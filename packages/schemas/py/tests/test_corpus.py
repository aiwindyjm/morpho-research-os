"""Cross-language contract corpus test.

Walks packages/schemas/fixtures/cases and asserts that the canonical JSON Schema
and the Pydantic bindings accept/reject exactly the cases the corpus expects.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from morpho_schemas import BINDINGS

SCHEMAS_DIR = Path(__file__).resolve().parents[2]
CASES_DIR = SCHEMAS_DIR / "fixtures" / "cases"

NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CASE_FILE_PATTERN = re.compile(r"^(valid|invalid)-[a-z0-9][a-z0-9-]*\.json$")
SCHEMA_FILE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*\.v\d+\.json$")


def _contained(root: Path, target: Path) -> Path:
    resolved_root = root.resolve()
    resolved_target = target.resolve()
    if resolved_target != resolved_root and resolved_root not in resolved_target.parents:
        raise ValueError(f"refusing to read outside {resolved_root}: {resolved_target}")
    return resolved_target


def _load_cases() -> list[tuple[str, str, bool, Any]]:
    cases: list[tuple[str, str, bool, Any]] = []
    for schema_dir in sorted(p for p in CASES_DIR.iterdir() if p.is_dir()):
        if not NAME_PATTERN.match(schema_dir.name):
            continue
        for case_file in sorted(schema_dir.glob("*.json")):
            if not CASE_FILE_PATTERN.match(case_file.name):
                continue
            with _contained(CASES_DIR, case_file).open(encoding="utf-8") as handle:
                instance = json.load(handle)
            cases.append((schema_dir.name, case_file.name, case_file.name.startswith("valid-"), instance))
    return cases


def _load_canonical() -> list[tuple[str, str, dict]]:
    canonical: list[tuple[str, str, dict]] = []
    for schema_file in sorted(p for p in SCHEMAS_DIR.glob("*.v*.json") if p.is_file()):
        if not SCHEMA_FILE_PATTERN.match(schema_file.name):
            continue
        with _contained(SCHEMAS_DIR, schema_file).open(encoding="utf-8") as handle:
            schema = json.load(handle)
        name = re.sub(r"\.v\d+\.json$", "", schema_file.name)
        canonical.append((name, schema_file.name, schema))
    return canonical


CASES = _load_cases()
CANONICAL = _load_canonical()
CANONICAL_BY_NAME = {name: schema for name, _, schema in CANONICAL}


def test_corpus_is_not_empty() -> None:
    assert CASES, f"no corpus cases found under {CASES_DIR}"


def test_every_schema_has_binding_and_both_expectations() -> None:
    for name, file_name, _ in CANONICAL:
        assert name in BINDINGS, f"missing Pydantic binding for schema '{name}' ({file_name})"
        schema_cases = [case for case in CASES if case[0] == name]
        assert any(case[2] for case in schema_cases), f"schema '{name}' has no valid case"
        assert any(not case[2] for case in schema_cases), f"schema '{name}' has no invalid case"


def test_no_case_references_unknown_schema() -> None:
    known = {name for name, _, _ in CANONICAL}
    for schema_name, file_name, _, _ in CASES:
        assert schema_name in known, f"unknown schema directory '{schema_name}' ({file_name})"


@pytest.mark.parametrize(
    "schema_name,file_name,expect_valid,instance",
    CASES,
    ids=[f"{schema}/{file}" for schema, file, _, _ in CASES],
)
def test_canonical_and_binding_agree(
    schema_name: str,
    file_name: str,
    expect_valid: bool,
    instance: Any,
) -> None:
    schema = CANONICAL_BY_NAME[schema_name]
    canonical_valid = Draft202012Validator(schema).is_valid(instance)
    assert canonical_valid == expect_valid, (
        f"{schema_name}/{file_name}: canonical JSON Schema says {canonical_valid}, expected {expect_valid}"
    )

    binding: type[BaseModel] = BINDINGS[schema_name]
    try:
        # Strict mode: canonical JSON Schema semantics never coerce parsed JSON values.
        binding.model_validate(instance, strict=True)
        binding_valid = True
    except ValidationError:
        binding_valid = False
    assert binding_valid == expect_valid, (
        f"{schema_name}/{file_name}: Pydantic binding said {binding_valid}, expected {expect_valid}"
    )
