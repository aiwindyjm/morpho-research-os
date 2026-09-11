import { nextUuid } from "./mocks/ids";
import { mockBackend } from "./mocks/backend";
import { MorphoError, isAbortError, toMorphoError } from "./errors";
import {
  ENVELOPE_SCHEMA_VERSION,
  responseSchemas,
  type CommandName,
  type CommandRequest,
  type CommandResponse,
  type Envelope,
  type Transport,
} from "./commands";

/**
 * Mock Transport: the only transport implementation until the Tauri IPC
 * contract is frozen (W2-05). It wraps the mock backend in the documented
 * envelope (docs/API.md), validates every response payload against the
 * schema registry, simulates latency, honours AbortSignal cancellation,
 * and surfaces typed MorphoError values.
 */

export interface MockTransportOptions {
  /** Simulated round-trip latency in milliseconds (default 60). */
  delayMs?: number;
}

let requestCounter = 0;

export function createMockTransport(options: MockTransportOptions = {}): Transport {
  const delayMs = options.delayMs ?? 60;

  return {
    async invoke<K extends CommandName>(
      command: K,
      payload: CommandRequest<K>,
      invokeOptions?: { signal?: AbortSignal },
    ): Promise<CommandResponse<K>> {
      if (invokeOptions?.signal?.aborted) {
        throw new DOMException("The request was aborted", "AbortError");
      }

      if (delayMs > 0) {
        await delay(delayMs, invokeOptions?.signal);
      }

      const requestId = `req-${++requestCounter}-${nextUuid()}`;
      let envelope: Envelope<CommandResponse<K>>;

      try {
        const data = mockBackend.handle(command, payload);
        envelope = { schema_version: ENVELOPE_SCHEMA_VERSION, request_id: requestId, data };
      } catch (error) {
        if (isAbortError(error)) throw error;
        const morphoError = toMorphoError(error);
        envelope = {
          schema_version: ENVELOPE_SCHEMA_VERSION,
          request_id: requestId,
          error: {
            code: morphoError.code,
            user_message: morphoError.userMessage,
            developer_detail: morphoError.developerDetail,
            retryable: morphoError.retryable,
            correlation_id: morphoError.correlationId,
            cause: morphoError.causeCode,
          },
        };
      }

      if (envelope.error) {
        throw new MorphoError(envelope.error);
      }

      // Parse → validate before anything reaches a component
      // (docs/PRD.md §11). A schema-invalid payload is a contract bug.
      const schema = responseSchemas[command];
      const parsed = schema.safeParse(envelope.data);
      if (!parsed.success) {
        throw new MorphoError({
          code: "VALIDATION_FAILED",
          user_message: "数据格式异常，请重试或报告问题。",
          developer_detail: `${command}: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
          retryable: false,
          correlation_id: requestId,
        });
      }

      return parsed.data;
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The request was aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      window.clearTimeout(timer);
      reject(new DOMException("The request was aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
