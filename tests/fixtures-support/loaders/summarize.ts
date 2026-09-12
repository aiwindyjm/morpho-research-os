/**
 * Fixture summary entry point.
 *
 * Prints a canonical FIXTURE_SUMMARY line for the golden fixtures so the
 * PowerShell runner can compare Node, Python, and Rust output byte for byte.
 * Must be started with the repository root as the current working directory
 * (run-fixture-checks.ps1 and CI both do this).
 */
import { join } from "node:path";
import { loadFixtureEnvelopes, summaryLine } from "./fixture-envelope.ts";

const root = process.cwd();
const fixtures = loadFixtureEnvelopes(join(root, "examples", "fixtures"), join(root, "packages", "schemas"));
console.log(`FIXTURE_SUMMARY ${summaryLine(fixtures)}`);
