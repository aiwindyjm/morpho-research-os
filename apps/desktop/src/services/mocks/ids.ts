/**
 * Deterministic UUIDv7-shaped identifiers for mock data and runtime
 * entities. Version nibble is 7 and variant nibble is 8–b, matching the
 * documented id format (docs/DATA_MODEL.md: UUIDv7 strings). No randomness
 * — tests stay reproducible.
 */

let counter = 0;

function hex(value: number, width: number): string {
  return value.toString(16).padStart(width, "0").slice(-width);
}

export function nextUuid(): string {
  counter += 1;
  const seq = counter;
  return [
    hex(0x7f000000 + (seq % 0x10000), 8),
    hex(seq % 0x1000, 4),
    `7${hex(seq % 0x100, 3)}`,
    `8${hex(seq % 0x100, 3)}`,
    hex(seq, 12),
  ].join("-");
}

/** Fixed fixture ids: stable, readable, UUIDv7-shaped. The group name is
 * hex-encoded (3 chars → 6 hex digits) to stay within the UUID alphabet. */
export function fixtureId(group: string, index: number): string {
  const prefix = group.slice(0, 3).padEnd(3, "0");
  let hexGroup = "";
  for (const char of prefix) {
    hexGroup += char.charCodeAt(0).toString(16).padStart(2, "0").slice(-2);
  }
  return [
    `7f${hexGroup}`,
    "0000",
    `7${hex(index % 0x100, 3)}`,
    `8${hex(index % 0x100, 3)}`,
    hex(index, 12),
  ].join("-");
}

/** Test-only: reset the counter between test cases. */
export function resetIdCounter(): void {
  counter = 0;
}
