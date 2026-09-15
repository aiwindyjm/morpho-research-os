import type { ReactNode } from "react";
import { Alert, Button, Skeleton } from "@morpho/ui";
import { useTranslation } from "react-i18next";
import { isMorphoError } from "@/services/errors";

/**
 * Mandatory page states (docs/frontend/AI_FRONTEND_RULES.md): every page
 * renders Loading, Empty, and Error through this overlay set so behaviour
 * stays consistent across the workbench. Shared sentences (loading/error/
 * retry) go through t() (ADR-023, "common" namespace); page-specific empty
 * titles/descriptions and custom loading labels are props supplied by the
 * caller — feature views translate them with their own namespace (I2).
 */

export function PageLoading({ label }: { label?: string }) {
  const { t } = useTranslation("common");
  const resolved = label ?? t("loading");
  return (
    <div role="status" aria-label={resolved} data-testid="page-loading">
      <span className="sr-only">{resolved}</span>
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
      <p className="max-w-[28rem] text-body text-text-secondary">{description}</p>
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
  const { t } = useTranslation("common");
  const message = isMorphoError(error)
    ? `${error.userMessage}${error.retryable ? t("error.retryableSuffix") : ""}`
    : t("error.unknown");
  const detail = isMorphoError(error) ? error.developerDetail : undefined;
  return (
    <div className="flex flex-col gap-md" data-testid="page-error">
      <Alert variant="error" title={t("error.title")}>
        <p>{message}</p>
        {detail ? (
          <p className="text-caption text-text-muted">
            {t("error.technicalDetail", { detail })}
          </p>
        ) : null}
      </Alert>
      {onRetry ? (
        <div>
          <Button onClick={onRetry}>{t("error.retry")}</Button>
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
