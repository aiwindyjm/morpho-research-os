"""Loader tests for the cross-language fixture envelope (Python side).

Run from the repository root:
    python tests/fixtures-support/loaders/test_fixture_envelope.py
"""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("fixture_envelope", HERE / "fixture_envelope.py")
assert _spec is not None and _spec.loader is not None
fixture_envelope = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fixture_envelope)

validate_envelope = fixture_envelope.validate_envelope
load_schema_registry = fixture_envelope.load_schema_registry
load_fixture_envelopes = fixture_envelope.load_fixture_envelopes
summary_line = fixture_envelope.summary_line
base_schema_name = fixture_envelope.base_schema_name
EnvelopeError = fixture_envelope.EnvelopeError

REPO_ROOT = Path.cwd()
FIXTURES_DIR = REPO_ROOT / "examples" / "fixtures"
SCHEMAS_DIR = REPO_ROOT / "packages" / "schemas"
INVALID_DIR = REPO_ROOT / "tests" / "fixtures-support" / "fixtures-invalid"

EXPECTED_IDS = ["brain-computer-interface", "large-language-model", "quantum-entanglement"]
RESEARCH_CONFIG_SCHEMA = "https://morpho.dev/schemas/research-config.v1.json"
EXPECTED_SUMMARY = (
    '[{"fixture_id":"brain-computer-interface","input_schema":"' + RESEARCH_CONFIG_SCHEMA + '"},'
    '{"fixture_id":"large-language-model","input_schema":"' + RESEARCH_CONFIG_SCHEMA + '"},'
    '{"fixture_id":"quantum-entanglement","input_schema":"' + RESEARCH_CONFIG_SCHEMA + '"}]'
)

INVALID_CASES = [
    ("bad-envelope-version", "envelope-version"),
    ("fixture-id-mismatch", "fixture-id"),
    ("kind-mismatch", "kind-mismatch"),
    ("missing-provenance", "missing-field"),
    ("payload-missing-required", "payload-required"),
    ("unknown-top-level-field", "unknown-field"),
    ("unresolvable-input-schema", "schema-unresolved"),
]


class GoldenFixtureTest(unittest.TestCase):
    def test_all_golden_fixtures_load_and_validate(self) -> None:
        fixtures = load_fixture_envelopes(FIXTURES_DIR, SCHEMAS_DIR)
        self.assertEqual([f["fixture_id"] for f in fixtures], EXPECTED_IDS)
        for fixture in fixtures:
            self.assertEqual(fixture["fixture_envelope_version"], "1.0")
            self.assertEqual(fixture["input"]["schema"], RESEARCH_CONFIG_SCHEMA)
            self.assertEqual(fixture["kind"], "research-config")
            self.assertTrue(fixture["provenance"]["synthetic"])

    def test_summary_line_is_deterministic_and_cross_language_comparable(self) -> None:
        fixtures = load_fixture_envelopes(FIXTURES_DIR, SCHEMAS_DIR)
        self.assertEqual(summary_line(fixtures), EXPECTED_SUMMARY)

    def test_base_schema_name_strips_extension_and_version(self) -> None:
        self.assertEqual(base_schema_name(RESEARCH_CONFIG_SCHEMA), "research-config")

    def test_invalid_fixtures_fail_with_expected_rule(self) -> None:
        registry = load_schema_registry(SCHEMAS_DIR)
        for directory, rule in INVALID_CASES:
            with self.subTest(case=directory):
                raw = json.loads((INVALID_DIR / directory / "fixture.json").read_text(encoding="utf-8"))
                with self.assertRaises(EnvelopeError) as context:
                    validate_envelope(raw, directory, registry)
                self.assertIn(f"[{rule}]", str(context.exception))


if __name__ == "__main__":
    unittest.main()
