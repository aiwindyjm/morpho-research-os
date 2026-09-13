import {
  forwardRef,
  useRef,
  useState,
  type ButtonHTMLAttributes,
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
  /** Prefixes a status dot tinted by the variant (neutral maps to the
   * dot-muted text-secondary ink). The dot is decorative; the label text
   * carries the meaning for assistive tech. */
  dot?: boolean;
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

/* Status-dot fills per variant (promoted from the Topbar "已保存" dot and
 * the ProjectSwitcher status dots: size-dot rounded-full + a bg-* driven
 * by the state; neutral reuses the effect layer's dot-muted ink). Glow
 * rings (dot-glow-*) stay app-side className concerns. */
const badgeDotClasses: Record<BadgeVariant, string> = {
  neutral: "bg-text-secondary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

/** Registered primitive: Badge — short status or count label. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", dot = false, className = "", children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`inline-flex items-center gap-xs rounded-full border px-sm py-0.5 text-caption ${badgeVariantClasses[variant]} ${className}`}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`inline-block size-dot shrink-0 rounded-full ${badgeDotClasses[variant]}`}
        />
      ) : null}
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
      className={`rounded-lg border border-border bg-surface p-lg shadow-panel ${className}`}
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
 * accessible name; the percentage is rendered for non-visual confirmation.
 * The fill moves via transform (scaleX) rather than width so progress
 * animation stays on the compositor; indeterminate slides through the
 * track (a static full bar would read as "done") and honors the global
 * reduced-motion override. */
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
        className={`h-full w-full origin-left rounded-full bg-accent ${
          determinate
            ? "transition-transform duration-[var(--morpho-motion-base)]"
            : "animate-[morpho-progress-slide_1.4s_ease-in-out_infinite]"
        }`}
        style={{ transform: percent !== null ? `scaleX(${percent / 100})` : undefined }}
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
              className={`rounded-t-md px-md py-sm text-label transition-[color,border-color,transform] duration-[var(--morpho-motion-fast)] active:scale-[0.98] ${
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

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selection state; announced via aria-pressed (toggle-button pattern,
   * matching the prototype filter/dimension chips it promotes). */
  selected?: boolean;
  children: ReactNode;
}

const chipIdleClasses = "border-border text-text-muted hover:text-text-secondary";
const chipSelectedClasses = "border-accent/55 bg-accent-soft text-accent";

/**
 * Registered primitive: Chip — compact selectable filter/dimension button
 * (promoted from the graph, sources, and config chip rows). States:
 * default (quiet border + muted ink, hover lifts ink one step), selected
 * (brass ink + 0.55 brass border + accent-soft face — the `.chip-selected`
 * contract re-expressed inline with tokens so the primitive stays
 * token-only; the app effect class is retired by the adoption migration),
 * focus-visible (global ring), disabled (muted ink, no pointer feedback).
 * Accessibility: native button with aria-pressed; selection changes are
 * owned by the caller via onClick.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, disabled, className = "", children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-pressed={selected}
      disabled={disabled}
      className={`inline-flex items-center rounded-full border px-md py-1 text-caption transition-colors duration-[var(--morpho-motion-fast)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-muted ${
        selected ? chipSelectedClasses : chipIdleClasses
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* SegmentedControl                                                    */
/* ------------------------------------------------------------------ */

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  /** Controlled selection (the value of the chosen option). */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the radiogroup. */
  label: string;
}

/**
 * Registered primitive: SegmentedControl — single-select joined segments
 * (promoted from the config page depth selector geometry: h-9 segments,
 * collapsed borders, rounded group ends). States: selected (brass fill +
 * on-brand ink — an intentional upgrade over the prototype's chip-selected
 * face for a firmer single-select affordance), unselected (quiet surface
 * face, hover lifts ink), focus-visible (global ring). Accessibility:
 * role=radiogroup with role=radio children and aria-checked; roving
 * tabindex (only the selected segment is tabbable); Arrow/Home/End move
 * selection with focus following and wrap at both ends.
 */
export function SegmentedControl({ options, value, onChange, label }: SegmentedControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const activeValue = options.some((option) => option.value === value)
    ? value
    : options[0]?.value;

  function moveTo(nextIndex: number) {
    const count = options.length;
    if (count === 0) return;
    const bounded = ((nextIndex % count) + count) % count;
    onChange(options[bounded].value);
    const radios = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[bounded]?.focus();
  }

  function handleKeydown(event: React.KeyboardEvent) {
    const radios = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    if (radios.length === 0) return;
    const currentIndex = Math.max(0, radios.indexOf(document.activeElement as HTMLButtonElement));
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = currentIndex + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = currentIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  }

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeydown}
      className="flex"
    >
      {options.map((option, index) => {
        const selected = option.value === activeValue;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`h-9 w-[52px] border text-caption transition-colors duration-[var(--morpho-motion-fast)] ${
              index > 0 ? "-ml-px" : ""
            } ${index === 0 ? "rounded-l-md" : ""} ${
              index === options.length - 1 ? "rounded-r-md" : ""
            } ${
              selected
                ? "relative z-10 border-accent bg-accent text-text-on-brand"
                : "border-border bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
