"""Validate offline fixtures against the unified fixture envelope and their contracts.

Covers both envelope variants of ``packages/schemas/fixture-envelope.v1.json``
(ADR-017): the contract variant (``*.fixture.json``) and the dataset variant
(``<dataset>/fixture.json``). Runs fully offline against local schema files; it
never touches the network, providers, or secrets. Exit code 1 lists every
failing file with its reason.

Usage:
    uv run --with jsonschema python scripts/validate-fixture.py --all
    uv run --with jsonschema python scripts/validate-fixture.py path/to/x.fixture.json ...
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_DIR = REPO_ROOT / "packages" / "schemas"
FIXTURES_DIR = REPO_ROOT / "examples" / "fixtures"


def load_schema_by_stem(name: str, major: str) -> dict:
    path = SCHEMAS_DIR / f"{name}.v{major}.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"Contract '{name}' major {major} not found at {path}. "
            "Fixture contract references must match a schema file."
        )
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_schema_by_id(schema_id: str) -> dict:
    for path in sorted(SCHEMAS_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            schema = json.load(handle)
        if schema.get("$id") == schema_id:
            return schema
    raise FileNotFoundError(
        f"Contract '{schema_id}' is not registered in packages/schemas. "
        "Dataset-variant input/expected_outputs schema references must be a "
        "canonical $id."
    )


def best_error(errors) -> str:
    messages = []
    for error in sorted(errors, key=lambda e: list(e.absolute_path)):
        location = "/".join(str(part) for part in error.absolute_path) or "<root>"
        messages.append(f"{location}: {error.message}")
    return "; ".join(messages[:5])


def check_instance(problems: list[str], path: Path, what: str, instance, contract_schema: dict) -> None:
    errors = list(Draft202012Validator(contract_schema).iter_errors(instance))
    if errors:
        problems.append(f"{path}: {what} violates the referenced contract: {best_error(errors)}")


def validate_contract_variant(fixture: dict, path: Path, problems: list[str]) -> None:
    """W0-05 contract variant: schema_version + contract; input/expected are payload instances."""

    for key in ("schema_version", "contract", "stability", "description"):
        if key not in fixture:
            problems.append(f"{path}: contract-variant fixture is missing '{key}'")
    contract = fixture.get("contract")
    if not isinstance(contract, dict):
        return
    schema_name = contract.get("schema")
    schema_version = contract.get("schema_version")
    if not isinstance(schema_name, str) or not isinstance(schema_version, str):
        problems.append(f"{path}: contract.schema and contract.schema_version must be strings")
        return
    major = schema_version.split(".")[0]
    try:
        contract_schema = load_schema_by_stem(schema_name, major)
    except FileNotFoundError as error:
        problems.append(f"{path}: {error}")
        return
    for field in ("input", "expected"):
        if field not in fixture:
            continue
        check_instance(problems, path, field, fixture[field], contract_schema)


def validate_dataset_variant(fixture: dict, path: Path, problems: list[str]) -> None:
    """TEST-01 dataset variant: fixture_envelope_version + kind + input{schema, payload}."""

    for key in ("fixture_envelope_version", "kind"):
        if key not in fixture:
            problems.append(f"{path}: dataset-variant fixture is missing '{key}'")
    input_block = fixture.get("input")
    if not isinstance(input_block, dict):
        problems.append(f"{path}: dataset-variant input must be an object with schema and payload")
        return
    schema_id = input_block.get("schema")
    payload = input_block.get("payload")
    if not isinstance(schema_id, str) or not isinstance(payload, dict):
        problems.append(f"{path}: dataset-variant input must contain string schema and object payload")
        return
    if set(input_block) - {"schema", "payload"}:
        problems.append(f"{path}: dataset-variant input may only contain schema and payload")
    try:
        contract_schema = load_schema_by_id(schema_id)
    except FileNotFoundError as error:
        problems.append(f"{path}: {error}")
        return
    check_instance(problems, path, "input.payload", payload, contract_schema)
    outputs = fixture.get("expected_outputs")
    if outputs is None:
        return
    if not isinstance(outputs, list):
        problems.append(f"{path}: expected_outputs must be an array")
        return
    for index, output in enumerate(outputs):
        if not isinstance(output, dict) or not isinstance(output.get("schema"), str):
            problems.append(f"{path}: expected_outputs[{index}] must contain a string schema")
            continue
        try:
            output_schema = load_schema_by_id(output["schema"])
        except FileNotFoundError as error:
            problems.append(f"{path}: {error}")
            continue
        check_instance(problems, path, f"expected_outputs[{index}].payload", output.get("payload"), output_schema)


def validate_fixture(path: Path) -> list[str]:
    problems: list[str] = []
    try:
        with path.open(encoding="utf-8") as handle:
            fixture = json.load(handle)
    except json.JSONDecodeError as error:
        return [f"{path}: invalid JSON ({error})"]

    envelope_schema = load_schema_by_stem("fixture-envelope", "1")
    errors = list(Draft202012Validator(envelope_schema).iter_errors(fixture))
    if errors:
        return [f"{path}: envelope invalid: {best_error(errors)}"]

    has_contract_marker = "schema_version" in fixture or "contract" in fixture
    has_dataset_marker = "fixture_envelope_version" in fixture or "kind" in fixture
    if has_contract_marker and has_dataset_marker:
        return [
            f"{path}: mixed envelope variants: a fixture must use either the "
            "contract variant (schema_version + contract) or the dataset "
            "variant (fixture_envelope_version + kind), never both (ADR-017)."
        ]
    if has_dataset_marker:
        validate_dataset_variant(fixture, path, problems)
    elif has_contract_marker:
        validate_contract_variant(fixture, path, problems)
    else:
        problems.append(
            f"{path}: unrecognized envelope variant: missing both the contract "
            "marker (schema_version) and the dataset marker (fixture_envelope_version) (ADR-017)."
        )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Validate every fixture under examples/fixtures (both *.fixture.json and <dataset>/fixture.json).")
    parser.add_argument("paths", nargs="*", help="Explicit fixture files to validate.")
    args = parser.parse_args()

    if args.all:
        files = sorted(
            set(FIXTURES_DIR.rglob("*.fixture.json")) | set(FIXTURES_DIR.rglob("fixture.json"))
        )
        if not files:
            print(f"No fixtures found under {FIXTURES_DIR}", file=sys.stderr)
            return 1
    elif args.paths:
        files = [Path(p) for p in args.paths]
    else:
        parser.error("pass --all or at least one fixture path")
        return 1

    problems: list[str] = []
    for path in files:
        problems.extend(validate_fixture(path))

    if problems:
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        print(f"{len(problems)} problem(s) across {len(files)} fixture(s)", file=sys.stderr)
        return 1

    print(f"OK: {len(files)} fixture(s) valid against the envelope and referenced contracts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
