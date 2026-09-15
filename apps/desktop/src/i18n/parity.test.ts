import { describe, expect, it } from "vitest";
import { LANGUAGE_IDS, NAMESPACES, REFERENCE_LANGUAGE } from "./index";
import { resources } from "./resources";

/**
 * Structural parity guard (I3): every registered locale must expose exactly
 * the zh-CN reference key set in every namespace. A missing key would render
 * through the fallback chain instead of the user's language; an extra key
 * would silently rot. Placeholder locales (en re-export copies, batch-pending
 * translation) pass by construction and stay in lockstep with en — the
 * authored en set itself is guarded by the same assertion against zh-CN.
 */

/** Collects every leaf path ("nav.plan") of a nested resource object. */
function keyPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") {
    return prefix ? [prefix] : [];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale structural parity (reference: zh-CN)", () => {
  it("registers the full 10-language whitelist in resources", () => {
    for (const id of LANGUAGE_IDS) {
      expect(resources[id], `resources["${id}"]`).toBeDefined();
      for (const ns of NAMESPACES) {
        expect(resources[id][ns], `${id}:${ns}`).toBeDefined();
      }
    }
  });

  it.each(LANGUAGE_IDS)(
    "%s exposes exactly the zh-CN key set in every namespace",
    (id) => {
      for (const ns of NAMESPACES) {
        const reference = keyPaths(resources[REFERENCE_LANGUAGE][ns]).sort();
        const candidate = keyPaths(resources[id][ns]).sort();
        expect(candidate, `${id}:${ns} key parity`).toEqual(reference);
      }
    },
  );
});
