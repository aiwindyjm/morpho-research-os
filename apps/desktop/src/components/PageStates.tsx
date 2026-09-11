import type { ReactNode } from "react";
import { Alert, Button, Skeleton } from "@morpho/ui";
import { isMorphoError } from "@/services/errors";

/**
 * Mandatory page states (docs/frontend/AI_FRONTEND_RULES.md): every page
 * renders Loading, Empty, and Error through this overlay set so behaviour
 * stays consistent across the workbench.
 */

export function PageLoading({ label = "正在加载…" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} data-testid="page-loading">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-md">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-2/3" />
      </div>
    </div>
  );
}

export function PageEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-sm rounded-lg border border-dashed border-border bg-surface p-xl text-center"
      data-testid="page-empty"
    >
      <p className="text-h3 text-text-primary">{title}</p>
      <p className="max-w-md text-body text-text-secondary">{description}</p>
      {action ? <div className="mt-sm">{action}</div> : null}
    </div>
  );
}

export function PageError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    isMorphoError(error)
      ? `${error.userMessage}${error.retryable ? "（可重试）" : ""}`
      : "发生未知错误，请重试。";
  const detail = isMorphoError(error) ? error.developerDetail : undefined;
  return (
    <div className="flex flex-col gap-md" data-testid="page-error">
      <Alert variant="error" title="出错了">
        <p>{message}</p>
        {detail ? (
          <p className="text-caption text-text-muted">技术细节：{detail}</p>
        ) : null}
      </Alert>
      {onRetry ? (
        <div>
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Compose the three mandatory states around loaded content. */
export function PageStates({
  isLoading,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty: boolean;
  empty: { title: string; description: string; action?: ReactNode };
  children: ReactNode;
}) {
  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={onRetry} />;
  if (isEmpty) return <PageEmpty {...empty} />;
  return <>{children}</>;
}
