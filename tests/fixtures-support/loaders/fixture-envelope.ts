/**
 * Cross-language fixture envelope loader (TypeScript reference implementation).
 *
 * Validation rules are mirrored in `fixture_envelope.py` and
 * `loaders/rust-loader/`. A rule change must land in all three at once.
 * Envelope contract: packages/schemas/fixture-envelope.v1.json (unified, ADR-017;
 * these loaders enforce the dataset-variant rules of that schema).
 * Payload validation is intentionally shallow (required + const at the top
 * level of the referenced canonical schema); deep validation belongs to the
 * schema toolchain, not to fixtures.
 *
 * Pure library: callers pass explicit fixture and schema directories.
 * Entry points keep process.argv handling out of this module.
 *
 * Erasable TypeScript only (runs on Node >= 22.6 type stripping).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ENVELOPE_VERSION = "1.0";
const FIXTURE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOP_LEVEL_KEYS = [
  "fixture_envelope_version",
  "fixture_id",
  "kind",
  "description",
  "input",
  "expected_outputs",
  "provenance",
  "stability",
];
const REQUIRED_TOP_LEVEL_KEYS = ["fixture_envelope_version", "fixture_id", "kind", "input", "provenance"];
const INPUT_KEYS = ["schema", "payload"];
const OUTPUT_KEYS = ["name", "schema", "payload"];
const PROVENANCE_KEYS = ["origin", "synthetic", "license", "notes"];
const REQUIRED_PROVENANCE_KEYS = ["origin", "synthetic"];
const ORIGINS = ["synthetic", "curated-public", "user-contributed"];
const STABILITY_KEYS = ["deterministic", "ignored_fields"];

export interface FixtureInput {
  schema: string;
  payload: Record<string, unknown>;
}
export interface ExpectedOutput {
  name: string;
  schema: string;
  payload: Record<string, unknown>;
}
export interface FixtureEnvelope {
  fixture_envelope_version: string;
  fixture_id: string;
  kind: string;
  description?: string;
  input: FixtureInput;
  expected_outputs?: ExpectedOutput[];
  provenance: Record<string, unknown>;
  stability?: Record<string, unknown>;
}
export interface LoadedFixture {
  envelope: FixtureEnvelope;
  inputSchema: unknown; // parsed canonical schema for the input payload
}
export interface SchemaRegistryEntry {
  filename: string;
  schema: Record<string, unknown>;
}
export type SchemaRegistry = Map<string, SchemaRegistryEntry>;

/** Fails with a stable `[rule]` prefix so tests and CI can attribute errors. */
function fail(rule: string, message: string): never {
  throw new Error(`[${rule}] ${message}`);
}

function expectObject(value: unknown, rule: string, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(rule, `${what} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** Strips the `.json` extension and trailing `.vN` from a schema $id path segment. */
export function baseSchemaName(schemaId: string): string {
  const segment = schemaId.split("/").filter(Boolean).pop() ?? "";
  return segment.replace(/\.json$/, "").replace(/\.v\d+$/, "");
}

export function loadSchemaRegistry(schemasDir: string): SchemaRegistry {
  const registry: SchemaRegistry = new Map();
  for (const name of readdirSync(schemasDir).sort()) {
    if (!name.endsWith(".json")) continue;
    const path = join(schemasDir, name);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const id = parsed.$id;
    if (typeof id === "string") {
      registry.set(id, { filename: name, schema: parsed });
    }
  }
  return registry;
}

function validatePayloadShallow(
  payload: unknown,
  schema: Record<string, unknown>,
  schemaId: string,
  what: string,
): void {
  const object = expectObject(payload, "payload-shape", what);
  const required = schema.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === "string" && !(key in object)) {
        fail("payload-required", `${what} is missing required field "${key}" of ${schemaId}`);
      }
    }
  }
  const properties = schema.properties;
  if (typeof properties === "object" && properties !== null) {
    for (const [key, definition] of Object.entries(properties as Record<string, unknown>)) {
      if (!(key in object) || typeof definition !== "object" || definition === null) continue;
      const constant = (definition as Record<string, unknown>).const;
      if (constant !== undefined && object[key] !== constant) {
        fail("payload-const", `${what} field "${key}" must equal ${JSON.stringify(constant)} per ${schemaId}`);
      }
    }
  }
}

function validateResolvablePayload(
  container: Record<string, unknown>,
  registry: SchemaRegistry,
  what: string,
): void {
  const schemaId = container.schema;
  if (typeof schemaId !== "string" || schemaId.length === 0) {
    fail("input-shape", `${what}.schema must be a non-empty string`);
  }
  const entry = registry.get(schemaId);
  if (!entry) {
    fail("schema-unresolved", `${what}.schema "${schemaId}" is not registered in packages/schemas`);
  }
  validatePayloadShallow(container.payload, entry.schema, schemaId, `${what}.payload`);
}

export function validateEnvelope(raw: unknown, fixtureDirName: string, registry: SchemaRegistry): FixtureEnvelope {
  const object = expectObject(raw, "shape", "fixture envelope");
  for (const key of Object.keys(object)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      fail("unknown-field", `unknown top-level field "${key}"`);
    }
  }
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in object)) {
      fail("missing-field", `missing required field "${key}"`);
    }
  }
  if (object.fixture_envelope_version !== ENVELOPE_VERSION) {
    fail("envelope-version", `fixture_envelope_version must be "${ENVELOPE_VERSION}", got ${JSON.stringify(object.fixture_envelope_version)}`);
  }
  const fixtureId = object.fixture_id;
  if (typeof fixtureId !== "string" || !FIXTURE_ID_PATTERN.test(fixtureId)) {
    fail("fixture-id", `fixture_id "${String(fixtureId)}" is not kebab-case`);
  }
  if (fixtureId !== fixtureDirName) {
    fail("fixture-id", `fixture_id "${fixtureId}" must equal its directory name "${fixtureDirName}"`);
  }
  const kind = object.kind;
  if (typeof kind !== "string" || !NAME_PATTERN.test(kind)) {
    fail("kind", `kind ${JSON.stringify(kind)} is not a lowercase kebab-case name`);
  }
  const input = expectObject(object.input, "input-shape", "input");
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) fail("input-shape", `unknown input field "${key}"`);
  }
  for (const key of INPUT_KEYS) {
    if (!(key in input)) fail("input-shape", `input is missing "${key}"`);
  }
  if (typeof input.schema === "string" && baseSchemaName(input.schema) !== kind) {
    fail("kind-mismatch", `kind "${kind}" does not match input schema base name "${baseSchemaName(input.schema)}"`);
  }
  validateResolvablePayload(input, registry, "input");
  const outputs = object.expected_outputs;
  if (outputs !== undefined) {
    if (!Array.isArray(outputs)) fail("output-shape", "expected_outputs must be an array");
    for (const output of outputs) {
      const entry = expectObject(output, "output-shape", "expected_outputs entry");
      for (const key of Object.keys(entry)) {
        if (!OUTPUT_KEYS.includes(key)) fail("output-shape", `unknown expected_outputs field "${key}"`);
      }
      for (const key of OUTPUT_KEYS) {
        if (!(key in entry)) fail("output-shape", `expected_outputs entry is missing "${key}"`);
      }
      if (typeof entry.name !== "string" || !NAME_PATTERN.test(entry.name)) {
        fail("output-shape", `expected_outputs name ${JSON.stringify(entry.name)} is invalid`);
      }
      validateResolvablePayload(entry, registry, `expected_outputs "${String(entry.name)}"`);
    }
  }
  const provenance = expectObject(object.provenance, "provenance-shape", "provenance");
  for (const key of Object.keys(provenance)) {
    if (!PROVENANCE_KEYS.includes(key)) fail("provenance-shape", `unknown provenance field "${key}"`);
  }
  for (const key of REQUIRED_PROVENANCE_KEYS) {
    if (!(key in provenance)) fail("provenance-shape", `provenance is missing "${key}"`);
  }
  if (!ORIGINS.includes(String(provenance.origin))) {
    fail("provenance-shape", `provenance.origin ${JSON.stringify(provenance.origin)} is not one of ${ORIGINS.join(", ")}`);
  }
  if (typeof provenance.synthetic !== "boolean") {
    fail("provenance-shape", "provenance.synthetic must be a boolean");
  }
  const stability = object.stability;
  if (stability !== undefined) {
    const stable = expectObject(stability, "stability-shape", "stability");
    for (const key of Object.keys(stable)) {
      if (!STABILITY_KEYS.includes(key)) fail("stability-shape", `unknown stability field "${key}"`);
    }
    if (stable.deterministic !== undefined && typeof stable.deterministic !== "boolean") {
      fail("stability-shape", "stability.deterministic must be a boolean");
    }
    if (stable.ignored_fields !== undefined) {
      if (!Array.isArray(stable.ignored_fields) || stable.ignored_fields.some((f) => typeof f !== "string")) {
        fail("stability-shape", "stability.ignored_fields must be an array of strings");
      }
    }
  }
  return object as unknown as FixtureEnvelope;
}

export function loadFixtureEnvelopes(fixturesDir: string, schemasDir: string): LoadedFixture[] {
  const registry = loadSchemaRegistry(schemasDir);
  const seen = new Map<string, string>();
  const loaded: LoadedFixture[] = [];
  for (const name of readdirSync(fixturesDir).sort()) {
    const fixtureFile = join(fixturesDir, name, "fixture.json");
    if (!existsSync(fixtureFile)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(fixtureFile, "utf8"));
    } catch (error) {
      fail("json", `${fixtureFile} is not valid JSON: ${(error as Error).message}`);
    }
    const envelope = validateEnvelope(raw, name, registry);
    if (seen.has(envelope.fixture_id)) {
      fail("duplicate-id", `fixture_id "${envelope.fixture_id}" already defined by ${seen.get(envelope.fixture_id)}`);
    }
    seen.set(envelope.fixture_id, fixtureFile);
    loaded.push({
      envelope,
      inputSchema: registry.get(envelope.input.schema)?.schema,
    });
  }
  return loaded.sort((a, b) => (a.envelope.fixture_id < b.envelope.fixture_id ? -1 : 1));
}

/** Canonical summary string; must stay byte-identical across all loader implementations. */
export function summaryLine(fixtures: LoadedFixture[]): string {
  const parts = fixtures.map(
    (fixture) => `{"fixture_id":"${fixture.envelope.fixture_id}","input_schema":"${fixture.envelope.input.schema}"}`,
  );
  return `[${parts.join(",")}]`;
}
