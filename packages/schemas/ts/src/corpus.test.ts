import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { BINDINGS } from "./index";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(HERE, "..", "..");
const CASES_DIR = path.join(SCHEMAS_DIR, "fixtures", "cases");

/** Directory and file names are restricted to kebab-case JSON stems; anything else is rejected. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CASE_FILE_PATTERN = /^(valid|invalid)-[a-z0-9][a-z0-9-]*\.json$/;
const SCHEMA_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.v\d+\.json$/;

/** Resolves `parts` under `root` and refuses anything that escapes the root (path traversal guard). */
function containedJoin(root: string, ...parts: string[]): string {
  const target = path.resolve(root, ...parts);
  const normalizedRoot = path.resolve(root);
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + path.sep)) {
    throw new Error(`refusing to read outside ${normalizedRoot}: ${target}`);
  }
  return target;
}

function readJson(target: string): unknown {
  return JSON.parse(readFileSync(target, "utf8"));
}

interface CaseFile {
  schemaName: string;
  file: string;
  expectValid: boolean;
  instance: unknown;
}

function loadCases(): CaseFile[] {
  const cases: CaseFile[] = [];
  for (const schemaName of readdirSync(CASES_DIR)) {
    if (!NAME_PATTERN.test(schemaName)) continue;
    const schemaDir = containedJoin(CASES_DIR, schemaName);
    for (const file of readdirSync(schemaDir)) {
      if (!CASE_FILE_PATTERN.test(file)) continue;
      cases.push({
        schemaName,
        file,
        expectValid: file.startsWith("valid-"),
        instance: readJson(containedJoin(schemaDir, file)),
      });
    }
  }
  return cases;
}

function canonicalSchemaFiles(): { name: string; file: string; schema: Record<string, unknown> }[] {
  return readdirSync(SCHEMAS_DIR)
    .filter((file) => SCHEMA_FILE_PATTERN.test(file))
    .map((file) => ({
      file,
      name: file.replace(/\.v\d+\.json$/, ""),
      schema: readJson(containedJoin(SCHEMAS_DIR, file)) as Record<string, unknown>,
    }));
}

const ajv = new Ajv2020({ strict: false });
const cases = loadCases();
const canonical = canonicalSchemaFiles();

describe("corpus coverage", () => {
  it("every canonical schema has a binding and both valid and invalid cases", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const { name } of canonical) {
      expect(BINDINGS[name], `missing Zod binding for schema '${name}'`).toBeDefined();
      const schemaCases = cases.filter((c) => c.schemaName === name);
      expect(
        schemaCases.some((c) => c.expectValid),
        `schema '${name}' has no valid case`,
      ).toBe(true);
      expect(
        schemaCases.some((c) => !c.expectValid),
        `schema '${name}' has no invalid case`,
      ).toBe(true);
    }
  });

  it("no corpus case references an unknown schema", () => {
    const names = new Set(canonical.map((c) => c.name));
    for (const testCase of cases) {
      expect(names.has(testCase.schemaName), `unknown schema directory '${testCase.schemaName}'`).toBe(true);
    }
  });
});

describe.each(cases)("corpus $schemaName/$file", ({ schemaName, file, expectValid, instance }) => {
  it("canonical JSON Schema agrees with the expectation", () => {
    const schema = canonical.find((c) => c.name === schemaName)?.schema;
    expect(schema, `missing canonical schema '${schemaName}'`).toBeDefined();
    const validate = ajv.compile(schema!);
    expect(validate(instance), `${schemaName}/${file}: ${JSON.stringify(validate.errors)}`).toBe(expectValid);
  });

  it("Zod binding agrees with the expectation", () => {
    const result = BINDINGS[schemaName]!.safeParse(instance);
    expect(
      result.success,
      `${schemaName}/${file}: expected ${expectValid ? "success" : "failure"}, got ${
        result.success ? "success" : result.error.message
      }`,
    ).toBe(expectValid);
  });
});
