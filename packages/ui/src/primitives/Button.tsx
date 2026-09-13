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

/* State model (spec §5, 8-state audit): filled variants lift 2px with a
 * deeper shadow on hover and press down to scale(0.98); ghost answers with
 * the warm overlay-hover tint plus an ink step. Hover/press are gated by
 * `enabled:` so disabled buttons never move. Disabled collapses every
 * variant to one shared quiet face (muted ink on the raised surface,
 * 4.67:1) instead of opacity dimming — a 0.5-opacity primary was 1:1. */
const hoverPressClasses =
  "enabled:hover:-translate-y-0.5 enabled:hover:shadow-panel enabled:active:translate-y-0 enabled:active:scale-[0.98]";

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-accent text-background enabled:hover:bg-accent/85 border-transparent ${hoverPressClasses}`,
  secondary: `bg-surface-raised text-text-primary border-border ${hoverPressClasses}`,
  ghost:
    "bg-transparent text-text-secondary border-transparent enabled:hover:bg-overlay-hover enabled:hover:text-text-primary enabled:active:scale-[0.98]",
  danger: `bg-error text-background enabled:hover:bg-error/85 border-transparent ${hoverPressClasses}`,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-sm text-caption gap-xs",
  md: "h-9 px-lg text-body gap-sm",
};

/**
 * Registered primitive: Button.
 * States: default, hover (lift + shadow deepen on filled variants, warm
 * tint on ghost), active (scale 0.98), focus-visible (global bronze ring),
 * disabled (shared muted face), loading (aria-busy + inline indicator).
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
      className={`inline-flex items-center justify-center rounded-md border font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--morpho-motion-fast)] disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-muted ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
