"""Cross-language fixture envelope loader (Python reference implementation).

Validation rules are mirrored in ``fixture-envelope.ts`` and
``loaders/rust-loader/``. A rule change must land in all three at once.
Envelope contract: ``packages/schemas/fixture-envelope.v1.json`` (unified,
ADR-017; these loaders enforce the dataset-variant rules of that schema).
Payload validation is intentionally shallow (required + const at the top
level of the referenced canonical schema); deep validation belongs to the
schema toolchain, not to fixtures.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

ENVELOPE_VERSION = "1.0"
FIXTURE_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$")
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
TOP_LEVEL_KEYS = (
    "fixture_envelope_version",
    "fixture_id",
    "kind",
    "description",
    "input",
    "expected_outputs",
    "provenance",
    "stability",
)
REQUIRED_TOP_LEVEL_KEYS = ("fixture_envelope_version", "fixture_id", "kind", "input", "provenance")
INPUT_KEYS = ("schema", "payload")
OUTPUT_KEYS = ("name", "schema", "payload")
PROVENANCE_KEYS = ("origin", "synthetic", "license", "notes")
REQUIRED_PROVENANCE_KEYS = ("origin", "synthetic")
ORIGINS = ("synthetic", "curated-public", "user-contributed")
STABILITY_KEYS = ("deterministic", "ignored_fields")


class EnvelopeError(Exception):
    """Validation failure carrying a stable rule code for test attribution."""

    def __init__(self, rule: str, message: str) -> None:
        super().__init__(f"[{rule}] {message}")
        self.rule = rule


def _expect_object(value: Any, rule: str, what: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise EnvelopeError(rule, f"{what} must be a JSON object")
    return value


def base_schema_name(schema_id: str) -> str:
    """Strip the ``.json`` extension and trailing ``.vN`` from a schema $id segment."""
    segment = [part for part in schema_id.split("/") if part][-1]
    segment = re.sub(r"\.json$", "", segment)
    return re.sub(r"\.v\d+$", "", segment)


def load_schema_registry(schemas_dir: Path) -> Dict[str, Tuple[Path, Dict[str, Any]]]:
    registry: Dict[str, Tuple[Path, Dict[str, Any]]] = {}
    for path in sorted(Path(schemas_dir).glob("*.json")):
        parsed = json.loads(path.read_text(encoding="utf-8"))
        schema_id = parsed.get("$id")
        if isinstance(schema_id, str):
            registry[schema_id] = (path, parsed)
    return registry


def _validate_payload_shallow(payload: Any, schema: Dict[str, Any], schema_id: str, what: str) -> None:
    obj = _expect_object(payload, "payload-shape", what)
    for key in schema.get("required", []):
        if isinstance(key, str) and key not in obj:
            raise EnvelopeError("payload-required", f'{what} is missing required field "{key}" of {schema_id}')
    properties = schema.get("properties")
    if isinstance(properties, dict):
        for key, definition in properties.items():
            if key not in obj or not isinstance(definition, dict):
                continue
            constant = definition.get("const")
            if constant is not None and obj[key] != constant:
                raise EnvelopeError(
                    "payload-const",
                    f'{what} field "{key}" must equal {json.dumps(constant)} per {schema_id}',
                )


def _validate_resolvable_payload(container: Dict[str, Any], registry: Dict[str, Any], what: str) -> None:
    schema_id = container.get("schema")
    if not isinstance(schema_id, str) or not schema_id:
        raise EnvelopeError("input-shape", f"{what}.schema must be a non-empty string")
    entry = registry.get(schema_id)
    if entry is None:
        raise EnvelopeError("schema-unresolved", f'{what}.schema "{schema_id}" is not registered in packages/schemas')
    _validate_payload_shallow(container.get("payload"), entry[1], schema_id, f"{what}.payload")


def validate_envelope(raw: Any, fixture_dir_name: str, registry: Dict[str, Any]) -> Dict[str, Any]:
    envelope = _expect_object(raw, "shape", "fixture envelope")
    for key in envelope:
        if key not in TOP_LEVEL_KEYS:
            raise EnvelopeError("unknown-field", f'unknown top-level field "{key}"')
    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in envelope:
            raise EnvelopeError("missing-field", f'missing required field "{key}"')
    if envelope["fixture_envelope_version"] != ENVELOPE_VERSION:
        raise EnvelopeError(
            "envelope-version",
            f'fixture_envelope_version must be "{ENVELOPE_VERSION}", got {json.dumps(envelope["fixture_envelope_version"])}',
        )
    fixture_id = envelope["fixture_id"]
    if not isinstance(fixture_id, str) or not FIXTURE_ID_RE.match(fixture_id):
        raise EnvelopeError("fixture-id", f'fixture_id {json.dumps(fixture_id)} is not kebab-case')
    if fixture_id != fixture_dir_name:
        raise EnvelopeError("fixture-id", f'fixture_id "{fixture_id}" must equal its directory name "{fixture_dir_name}"')
    kind = envelope["kind"]
    if not isinstance(kind, str) or not NAME_RE.match(kind):
        raise EnvelopeError("kind", f"kind {json.dumps(kind)} is not a lowercase kebab-case name")
    inp = _expect_object(envelope["input"], "input-shape", "input")
    for key in inp:
        if key not in INPUT_KEYS:
            raise EnvelopeError("input-shape", f'unknown input field "{key}"')
    for key in INPUT_KEYS:
        if key not in inp:
            raise EnvelopeError("input-shape", f'input is missing "{key}"')
    if isinstance(inp["schema"], str) and base_schema_name(inp["schema"]) != kind:
        raise EnvelopeError(
            "kind-mismatch",
            f'kind "{kind}" does not match input schema base name "{base_schema_name(inp["schema"])}"',
        )
    _validate_resolvable_payload(inp, registry, "input")
    outputs = envelope.get("expected_outputs")
    if outputs is not None:
        if not isinstance(outputs, list):
            raise EnvelopeError("output-shape", "expected_outputs must be an array")
        for output in outputs:
            entry = _expect_object(output, "output-shape", "expected_outputs entry")
            for key in entry:
                if key not in OUTPUT_KEYS:
                    raise EnvelopeError("output-shape", f'unknown expected_outputs field "{key}"')
            for key in OUTPUT_KEYS:
                if key not in entry:
                    raise EnvelopeError("output-shape", f'expected_outputs entry is missing "{key}"')
            if not isinstance(entry["name"], str) or not NAME_RE.match(entry["name"]):
                raise EnvelopeError("output-shape", f'expected_outputs name {json.dumps(entry["name"])} is invalid')
            _validate_resolvable_payload(entry, registry, f'expected_outputs "{entry["name"]}"')
    provenance = _expect_object(envelope["provenance"], "provenance-shape", "provenance")
    for key in provenance:
        if key not in PROVENANCE_KEYS:
            raise EnvelopeError("provenance-shape", f'unknown provenance field "{key}"')
    for key in REQUIRED_PROVENANCE_KEYS:
        if key not in provenance:
            raise EnvelopeError("provenance-shape", f'provenance is missing "{key}"')
    if provenance["origin"] not in ORIGINS:
        raise EnvelopeError(
            "provenance-shape",
            f'provenance.origin {json.dumps(provenance["origin"])} is not one of {", ".join(ORIGINS)}',
        )
    if not isinstance(provenance["synthetic"], bool):
        raise EnvelopeError("provenance-shape", "provenance.synthetic must be a boolean")
    stability = envelope.get("stability")
    if stability is not None:
        stable = _expect_object(stability, "stability-shape", "stability")
        for key in stable:
            if key not in STABILITY_KEYS:
                raise EnvelopeError("stability-shape", f'unknown stability field "{key}"')
        if "deterministic" in stable and not isinstance(stable["deterministic"], bool):
            raise EnvelopeError("stability-shape", "stability.deterministic must be a boolean")
        ignored = stable.get("ignored_fields")
        if ignored is not None and (not isinstance(ignored, list) or not all(isinstance(f, str) for f in ignored)):
            raise EnvelopeError("stability-shape", "stability.ignored_fields must be an array of strings")
    return envelope


def load_fixture_envelopes(fixtures_dir: Path, schemas_dir: Path) -> List[Dict[str, Any]]:
    registry = load_schema_registry(schemas_dir)
    seen: Dict[str, str] = {}
    loaded: List[Dict[str, Any]] = []
    for directory in sorted(Path(fixtures_dir).iterdir(), key=lambda p: p.name):
        fixture_file = directory / "fixture.json"
        if not directory.is_dir() or not fixture_file.is_file():
            continue
        try:
            raw = json.loads(fixture_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise EnvelopeError("json", f"{fixture_file} is not valid JSON: {error}") from error
        envelope = validate_envelope(raw, directory.name, registry)
        if envelope["fixture_id"] in seen:
            raise EnvelopeError(
                "duplicate-id",
                f'fixture_id "{envelope["fixture_id"]}" already defined by {seen[envelope["fixture_id"]]}',
            )
        seen[envelope["fixture_id"]] = str(fixture_file)
        loaded.append(envelope)
    return loaded


def summary_line(fixtures: List[Dict[str, Any]]) -> str:
    """Canonical summary string; must stay byte-identical across all loader implementations."""
    parts = [
        '{"fixture_id":"' + f["fixture_id"] + '","input_schema":"' + f["input"]["schema"] + '"}'
        for f in sorted(fixtures, key=lambda f: f["fixture_id"])
    ]
    return "[" + ",".join(parts) + "]"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate fixture envelopes; optionally print a FIXTURE_SUMMARY line.")
    parser.add_argument("--summary", action="store_true", help="print the canonical FIXTURE_SUMMARY line")
    parser.add_argument("fixtures_dir", nargs="?", default=None)
    parser.add_argument("schemas_dir", nargs="?", default=None)
    args = parser.parse_args()
    root = Path.cwd()
    fixtures_dir = Path(args.fixtures_dir) if args.fixtures_dir else root / "examples" / "fixtures"
    schemas_dir = Path(args.schemas_dir) if args.schemas_dir else root / "packages" / "schemas"
    try:
        fixtures = load_fixture_envelopes(fixtures_dir, schemas_dir)
    except EnvelopeError as error:
        print(error, file=sys.stderr)
        return 1
    if args.summary:
        print(f"FIXTURE_SUMMARY {summary_line(fixtures)}")
    else:
        for fixture in fixtures:
            print(f"{fixture['fixture_id']} ({fixture['kind']}) -> {fixture['input']['schema']}")
        print(f"{len(fixtures)} fixture(s) validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
