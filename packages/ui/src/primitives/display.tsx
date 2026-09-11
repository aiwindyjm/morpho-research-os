import {
  forwardRef,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "error" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  neutral: "border-border bg-surface text-text-secondary",
  accent: "border-accent/40 bg-accent-soft text-text-primary",
  success: "border-success/40 bg-success/10 text-text-primary",
  warning: "border-warning/40 bg-warning/10 text-text-primary",
  error: "border-error/40 bg-error/10 text-text-primary",
  info: "border-info/40 bg-info/10 text-text-primary",
};

/** Registered primitive: Badge — short status or count label. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", className = "", children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`inline-flex items-center gap-xs rounded-full border px-sm py-0.5 text-caption ${badgeVariantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
});

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Registered primitive: Card — raised surface for grouped content. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`rounded-lg border border-border bg-surface p-lg shadow-[var(--morpho-shadow-panel)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

/** Registered primitive: Table — semantic table wrapper set. */
export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  function Table({ className = "", ...rest }, ref) {
    return (
      <table
        ref={ref}
        className={`w-full border-collapse text-body ${className}`}
        {...rest}
      />
    );
  },
);

export const THead = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function THead({ className = "", ...rest }, ref) {
  return (
    <thead
      ref={ref}
      className={`border-b border-border text-left text-label text-text-muted ${className}`}
      {...rest}
    />
  );
});

export const TBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TBody({ className = "", ...rest }, ref) {
  return <tbody ref={ref} className={className} {...rest} />;
});

export const TR = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TR({ className = "", ...rest }, ref) {
    return (
      <tr ref={ref} className={`border-b border-border/60 ${className}`} {...rest} />
    );
  },
);

export const TH = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  function TH({ className = "", ...rest }, ref) {
    return (
      <th ref={ref} scope="col" className={`px-md py-sm ${className}`} {...rest} />
    );
  },
);

export const TD = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TD({ className = "", ...rest }, ref) {
    return (
      <td ref={ref} className={`px-md py-sm align-top ${className}`} {...rest} />
    );
  },
);

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export interface ProgressProps {
  /** Current value 0..max; omit for indeterminate. */
  value?: number;
  max?: number;
  label: string;
}

/** Registered primitive: Progress — determinate or indeterminate with an
 * accessible name; the percentage is rendered for non-visual confirmation. */
export function Progress({ value, max = 100, label }: ProgressProps) {
  const determinate = typeof value === "number";
  const percent = determinate ? Math.min(100, Math.round((value / max) * 100)) : null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-[var(--morpho-motion-base)]"
        style={{ width: percent !== null ? `${percent}%` : "100%" }}
        data-indeterminate={determinate ? undefined : "true"}
        data-testid="progress-fill"
      />
      {percent !== null ? (
        <span className="sr-only">{`${percent}%`}</span>
      ) : (
        <span className="sr-only">in progress</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

/** Registered primitive: Skeleton — decorative loading placeholder. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={`animate-pulse rounded-md bg-surface-raised ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Alert                                                               */
/* ------------------------------------------------------------------ */

export type AlertVariant = "info" | "success" | "warning" | "error";

export interface AlertProps {
  variant?: AlertVariant;
  title: string;
  children?: ReactNode;
}

const alertVariantClasses: Record<AlertVariant, string> = {
  info: "border-info/40",
  success: "border-success/40",
  warning: "border-warning/40",
  error: "border-error/40",
};

/** Registered primitive: Alert — variant notices; errors use role=alert. */
export function Alert({ variant = "info", title, children }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`rounded-md border bg-surface p-md ${alertVariantClasses[variant]}`}
    >
      <p className="text-label text-text-primary">{title}</p>
      {children ? (
        <div className="mt-xs text-body text-text-secondary">{children}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** Registered primitive: Tabs — roving tabindex, Arrow/Home/End keys,
 * aria-controls wiring between tab and panel. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const [activeId, setActiveId] = useState(items[0]?.id);
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeydown(event: React.KeyboardEvent) {
    const index = items.findIndex((t) => t.id === activeId);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveId(items[next].id);
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  const active = items.find((t) => t.id === activeId) ?? items[0];

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeydown}
        className="flex gap-sm border-b border-border"
      >
        {items.map((item) => {
          const selected = item.id === active?.id;
          return (
            <button
              key={item.id}
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              className={`rounded-t-md px-md py-sm text-label transition-colors duration-[var(--morpho-motion-fast)] ${
                selected
                  ? "border-b-2 border-accent text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== active?.id}
        >
          {item.id === active?.id ? item.content : null}
        </div>
      ))}
    </div>
  );
}
