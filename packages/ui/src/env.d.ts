// Minimal ambient typing for the value-pinning test's Node builtins.
// @types/node is intentionally not a dependency of this UI-only package;
// vitest runs the tests in Node, so only the type surface is declared here.
declare const process: { cwd(): string };
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
