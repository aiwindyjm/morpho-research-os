/**
 * Loader tests for the cross-language fixture envelope (TypeScript side).
 * Run from the repository root: node --test tests/fixtures-support/loaders/fixture-envelope.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { baseSchemaName, loadFixtureEnvelopes, loadSchemaRegistry, summaryLine, validateEnvelope } from "./fixture-envelope.ts";

const repoRoot = process.cwd();
const fixturesDir = join(repoRoot, "examples", "fixtures");
const schemasDir = join(repoRoot, "packages", "schemas");
const invalidDir = join(repoRoot, "tests", "fixtures-support", "fixtures-invalid");

const EXPECTED_IDS = ["brain-computer-interface", "large-language-model", "quantum-entanglement"];
const RESEARCH_CONFIG_SCHEMA = "https://morpho.dev/schemas/research-config.v1.json";
const EXPECTED_SUMMARY =
  '[{"fixture_id":"brain-computer-interface","input_schema":"' +
  RESEARCH_CONFIG_SCHEMA +
  '"},{"fixture_id":"large-language-model","input_schema":"' +
  RESEARCH_CONFIG_SCHEMA +
  '"},{"fixture_id":"quantum-entanglement","input_schema":"' +
  RESEARCH_CONFIG_SCHEMA +
  '"}]';

test("all golden fixtures load and validate", () => {
  const fixtures = loadFixtureEnvelopes(fixturesDir, schemasDir);
  assert.equal(fixtures.length, EXPECTED_IDS.length);
  assert.deepEqual(
    fixtures.map((fixture) => fixture.envelope.fixture_id),
    EXPECTED_IDS,
  );
  for (const fixture of fixtures) {
    assert.equal(fixture.envelope.fixture_envelope_version, "1.0");
    assert.equal(fixture.envelope.input.schema, RESEARCH_CONFIG_SCHEMA);
    assert.equal(fixture.envelope.kind, "research-config");
    assert.equal(fixture.envelope.provenance.synthetic, true);
  }
});

test("summary line is deterministic and cross-language comparable", () => {
  const fixtures = loadFixtureEnvelopes(fixturesDir, schemasDir);
  assert.equal(summaryLine(fixtures), EXPECTED_SUMMARY);
});

test("baseSchemaName strips the schema version suffix", () => {
  assert.equal(baseSchemaName(RESEARCH_CONFIG_SCHEMA), "research-config");
});

const INVALID_CASES: Array<[string, string]> = [
  ["bad-envelope-version", "envelope-version"],
  ["fixture-id-mismatch", "fixture-id"],
  ["kind-mismatch", "kind-mismatch"],
  ["missing-provenance", "missing-field"],
  ["payload-missing-required", "payload-required"],
  ["unknown-top-level-field", "unknown-field"],
  ["unresolvable-input-schema", "schema-unresolved"],
];

for (const [directory, rule] of INVALID_CASES) {
  test(`invalid fixture "${directory}" fails with [${rule}]`, () => {
    const raw: unknown = JSON.parse(readFileSync(join(invalidDir, directory, "fixture.json"), "utf8"));
    assert.throws(
      () => validateEnvelope(raw, directory, loadSchemaRegistry(schemasDir)),
      (error: Error) => error.message.includes(`[${rule}]`),
    );
  });
}
