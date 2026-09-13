import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

/** Registered primitive: field Label with consistent label typography. */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <label
      ref={ref}
      className={`block text-label text-text-secondary ${className}`}
      {...rest}
    >
      {children}
    </label>
  );
});

export interface FieldProps {
  label: string;
  /** Optional hint rendered under the control. */
  hint?: string;
  /** Error message; sets aria-invalid and links it via aria-describedby. */
  error?: string;
  /** Unique id is generated automatically when omitted. */
  id?: string;
  required?: boolean;
  children: (fieldProps: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}

/**
 * Field wrapper that wires label, hint, and error message to any control
 * through a render prop, so every input gets consistent accessibility
 * wiring without each page re-implementing it.
 */
export function Field({
  label,
  hint,
  error,
  id,
  required,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-error">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children({
        id: controlId,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-error">
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* Shared control states (spec §5, 8-state audit): hover warms the field one
 * rung up the surface ladder (gated by enabled:), invalid keeps the error
 * border, disabled mutes the ink instead of opacity dimming (text-muted
 * holds 5.13:1 on surface), and focus-visible is the celadon ring — the
 * form-field variant of the spec's brass-or-celadon rule (accent-alt holds
 * 5.84:1, above the 3:1 ring floor; buttons keep the global bronze ring). */
const controlClasses =
  "w-full rounded-md border bg-surface px-md text-body text-text-primary placeholder:text-text-muted transition-colors duration-[var(--morpho-motion-fast)] enabled:hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-text-muted aria-[invalid=true]:border-error focus-visible:outline-2 focus-visible:outline-accent-alt focus-visible:outline-offset-2";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Registered primitive: Input. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`h-9 ${controlClasses} ${className}`}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Registered primitive: Textarea. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid, className = "", rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={`py-sm ${controlClasses} ${className}`}
        {...rest}
      />
    );
  },
);

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Registered primitive: Select (native select for full keyboard support). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className = "", children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`h-9 ${controlClasses} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Registered primitive: Checkbox with an integrated label. Disabled
 * mutes the label ink (text-muted, 4.67:1) instead of opacity dimming. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, className = "", id, disabled, ...rest }, ref) {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <div className={`flex items-center gap-sm ${className}`}>
        <input
          ref={ref}
          id={controlId}
          type="checkbox"
          disabled={disabled}
          className="size-4 accent-[var(--morpho-color-accent)] disabled:cursor-not-allowed"
          {...rest}
        />
        <label
          htmlFor={controlId}
          className={`text-body ${disabled ? "text-text-muted" : "text-text-primary"}`}
        >
          {label}
        </label>
      </div>
    );
  },
);
