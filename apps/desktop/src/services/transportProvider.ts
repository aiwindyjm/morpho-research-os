import type { Transport } from "./commands";
import { createMockTransport } from "./transport";
import { createTauriTransport, hasTauriGlobal } from "./tauriTransport";

/**
 * Process-wide transport singleton. Inside the real desktop window
 * (tauri.conf.json `app.withGlobalTauri = true`) the Tauri IPC transport is
 * the automatic choice; plain-web preview, vitest, and Playwright e2e stay
 * on the in-memory mock. Components and query hooks must never bypass this
 * module.
 *
 * Precedence:
 *  1. `?transport=mock|tauri` query param (dev escape hatch);
 *  2. `localStorage["morpho.transport"]` (persisted escape hatch);
 *  3. mock forced under `import.meta.env.MODE === "test"` (vitest must
 *     never bind a desktop bridge, even if one leaks into jsdom);
 *  4. auto-detection: TauriTransport when `window.__TAURI__?.core?.invoke`
 *     exists, MockTransport otherwise.
 *
 * An explicit "tauri" override is only honored when the global bridge
 * actually exists; it falls back to auto-detection otherwise.
 */

export type TransportKind = "tauri" | "mock";

const TRANSPORT_QUERY_PARAM = "transport";
const TRANSPORT_STORAGE_KEY = "morpho.transport";

function isTransportKind(value: unknown): value is TransportKind {
  return value === "tauri" || value === "mock";
}

function readExplicitOverride(): TransportKind | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const query = new URLSearchParams(window.location.search).get(TRANSPORT_QUERY_PARAM);
    if (isTransportKind(query)) return query;
    const stored = window.localStorage.getItem(TRANSPORT_STORAGE_KEY);
    if (isTransportKind(stored)) return stored;
  } catch {
    // location/localStorage can be unavailable (privacy mode); fall
    // through to auto-detection.
  }
  return undefined;
}

/**
 * Test-only seam for the Vite build mode: vitest resolves
 * `import.meta.env.MODE` statically, so `vi.stubEnv` cannot change it at
 * runtime and tests override it here instead. `undefined` restores the
 * real value. Production code never touches this.
 */
let buildModeOverride: string | undefined;

export function setBuildModeOverride(mode: string | undefined): void {
  buildModeOverride = mode;
}

/** Reads the Vite mode defensively (no vite/client types in this project). */
function viteMode(): string | undefined {
  return buildModeOverride ?? (import.meta as { env?: { MODE?: string } }).env?.MODE;
}

export function resolveTransportKind(): TransportKind {
  const explicit = readExplicitOverride();
  if (explicit === "mock") return "mock";
  if (explicit === "tauri" && hasTauriGlobal()) return "tauri";
  if (viteMode() === "test") return "mock";
  return hasTauriGlobal() ? "tauri" : "mock";
}

function createDefaultTransport(): { transport: Transport; kind: TransportKind } {
  const kind = resolveTransportKind();
  return {
    kind,
    transport: kind === "tauri" ? createTauriTransport() : createMockTransport({ delayMs: 60 }),
  };
}

const initial = createDefaultTransport();
let activeTransport: Transport = initial.transport;
let activeKind: TransportKind = initial.kind;

export function getTransport(): Transport {
  return activeTransport;
}

/** Which transport is active — diagnostics and tests only. */
export function getTransportKind(): TransportKind {
  return activeKind;
}

/** For wiring and tests only. */
export function setTransport(transport: Transport, kind: TransportKind = "mock"): void {
  activeTransport = transport;
  activeKind = kind;
}

/** Re-runs the selection (auto-detection); tests use this between setups. */
export function resetTransport(): void {
  const next = createDefaultTransport();
  activeTransport = next.transport;
  activeKind = next.kind;
}
