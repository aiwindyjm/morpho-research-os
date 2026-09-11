import type { Transport } from "./commands";
import { createMockTransport } from "./transport";

/**
 * Process-wide transport singleton. The mock transport is the default and
 * only implementation in this phase; W2-05 will register the real Tauri
 * IPC transport here once groups A/C freeze the contract. Components and
 * query hooks must never bypass this module.
 */

let activeTransport: Transport = createMockTransport({ delayMs: 60 });

export function getTransport(): Transport {
  return activeTransport;
}

/** For W2-05 wiring and tests only. */
export function setTransport(transport: Transport): void {
  activeTransport = transport;
}

export function resetTransport(): void {
  activeTransport = createMockTransport({ delayMs: 60 });
}
