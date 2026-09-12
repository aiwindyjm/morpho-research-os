"""Validate offline fixtures against the frozen fixture envelope and their contracts.

Runs fully offline against local schema files; it never touches the network,
providers, or secrets. Exit code 1 lists every failing file with its reason.

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


def load_schema(name: str, major: str) -> dict:
    path = SCHEMAS_DIR / f"{name}.v{major}.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"Contract '{name}' major {major} not found at {path}. "
            "Fixture contract references must match a schema file."
        )
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def best_error(errors) -> str:
    messages = []
    for error in sorted(errors, key=lambda e: list(e.absolute_path)):
        location = "/".join(str(part) for part in error.absolute_path) or "<root>"
        messages.append(f"{location}: {error.message}")
    return "; ".join(messages[:5])


def validate_fixture(path: Path) -> list[str]:
    problems: list[str] = []
    try:
        with path.open(encoding="utf-8") as handle:
            fixture = json.load(handle)
    except json.JSONDecodeError as error:
        return [f"{path}: invalid JSON ({error})"]

    envelope_schema = load_schema("fixture-envelope", "1")
    errors = list(Draft202012Validator(envelope_schema).iter_errors(fixture))
    if errors:
        return [f"{path}: envelope invalid: {best_error(errors)}"]

    contract = fixture["contract"]
    major = contract["schema_version"].split(".")[0]
    try:
        contract_schema = load_schema(contract["schema"], major)
    except FileNotFoundError as error:
        return [f"{path}: {error}"]

    for field in ("input", "expected"):
        if field not in fixture:
            continue
        errors = list(Draft202012Validator(contract_schema).iter_errors(fixture[field]))
        if errors:
            problems.append(f"{path}: {field} violates {contract['schema']}: {best_error(errors)}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Validate every *.fixture.json under examples/fixtures.")
    parser.add_argument("paths", nargs="*", help="Explicit fixture files to validate.")
    args = parser.parse_args()

    if args.all:
        files = sorted(FIXTURES_DIR.rglob("*.fixture.json"))
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
