import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows an inline busy indicator and blocks interaction. */
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-background hover:bg-accent/85 border-transparent",
  secondary:
    "bg-surface-raised text-text-primary hover:bg-surface border-border",
  ghost: "bg-transparent text-text-secondary hover:bg-surface border-transparent",
  danger: "bg-error text-background hover:bg-error/85 border-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-sm text-caption gap-xs",
  md: "h-9 px-lg text-body gap-sm",
};

/**
 * Registered primitive: Button.
 * States: default, hover, focus-visible, disabled, loading.
 * Accessibility: native button semantics; loading sets aria-busy and
 * disables interaction; label content is rendered as text.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, disabled, className = "", children, type, ...rest },
  ref,
) {
  const isDisabled = disabled === true || loading;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center rounded-md border font-medium transition-colors duration-[var(--morpho-motion-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          data-testid="button-loading"
          className="size-3 animate-spin rounded-full border border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
});
