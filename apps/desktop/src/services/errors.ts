/**
 * Structured error model from docs/api/ERRORS.md and docs/PRD.md §15:
 * stable code, safe user message, developer detail, retryable flag, and
 * correlation id. Frontend code only ever sees MorphoError — raw transport
 * failures are converted at the boundary.
 */

export const ERROR_CODES = [
  "WORKER_NOT_AVAILABLE",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_TIMEOUT",
  "SEARCH_FAILED",
  "SOURCE_PARSE_FAILED",
  "LLM_INVALID_JSON",
  "TASK_DEPENDENCY_FAILED",
  "VAULT_WRITE_FAILED",
  "DATABASE_ERROR",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "CANCELLED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Wire shape of `error` inside the docs/API.md envelope. */
export interface ErrorPayload {
  code: ErrorCode;
  user_message: string;
  developer_detail: string;
  retryable: boolean;
  correlation_id: string;
  cause?: string;
}

export class MorphoError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly developerDetail: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly causeCode?: string;

  constructor(payload: ErrorPayload) {
    super(payload.user_message);
    this.name = "MorphoError";
    this.code = payload.code;
    this.userMessage = payload.user_message;
    this.developerDetail = payload.developer_detail;
    this.retryable = payload.retryable;
    this.correlationId = payload.correlation_id;
    this.causeCode = payload.cause;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isMorphoError(error: unknown): error is MorphoError {
  return error instanceof MorphoError;
}

/** Normalize anything thrown across the boundary into MorphoError. */
export function toMorphoError(error: unknown): MorphoError {
  if (error instanceof MorphoError) return error;
  if (isAbortError(error)) {
    return new MorphoError({
      code: "CANCELLED",
      user_message: "操作已取消。",
      developer_detail: "request aborted via AbortSignal",
      retryable: true,
      correlation_id: "local-abort",
    });
  }
  return new MorphoError({
    code: "DATABASE_ERROR",
    user_message: "发生本地错误，请重试。",
    developer_detail: error instanceof Error ? error.message : String(error),
    retryable: true,
    correlation_id: "local-unknown",
  });
}
