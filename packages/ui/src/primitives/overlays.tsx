import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Accessible description for screen readers. */
  description?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Registered primitive: Dialog.
 * Accessibility: role=dialog + aria-modal, Escape closes, focus moves into
 * the dialog on open, Tab is trapped, focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables?.[0] ?? panel)?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown, true);
    return () => {
      document.removeEventListener("keydown", handleKeydown, true);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-lg"
      data-testid="dialog-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-lg rounded-lg border border-border bg-surface-raised p-xl shadow-overlay animate-[var(--morpho-motion-slow)_var(--morpho-motion-ease)_morpho-overlay-in]"
      >
        <h2 id={titleId} className="text-h2 text-text-primary">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-sm text-body text-text-secondary">
            {description}
          </p>
        ) : null}
        <div className="mt-lg">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Popover                                                             */
/* ------------------------------------------------------------------ */

export interface PopoverProps {
  /** Render-prop trigger receiving open state and control handlers. */
  trigger: (props: {
    open: boolean;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog";
    onClick: () => void;
  }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}

/** Registered primitive: Popover — non-modal anchored panel; Escape and
 * outside clicks close it; focus stays with the trigger. */
export function Popover({ trigger, children, align = "start" }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerdown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("pointerdown", onPointerdown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("pointerdown", onPointerdown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({
        open,
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        onClick: () => setOpen((v) => !v),
      })}
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          data-testid="popover-panel"
          className={`absolute top-[calc(100%+4px)] z-40 min-w-48 rounded-md border border-border bg-surface-raised p-md shadow-panel animate-[var(--morpho-motion-base)_var(--morpho-motion-ease)_morpho-overlay-in] ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export interface TooltipProps {
  label: string;
  children: ReactNode;
}

/** Registered primitive: Tooltip — visible on hover and keyboard focus,
 * linked to the trigger via aria-describedby. The tooltip id is wired onto
 * the single trigger element child; non-element children render unchanged. */
export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  let trigger = children;
  if (isValidElement<{ "aria-describedby"?: string }>(children)) {
    const existing = children.props["aria-describedby"];
    trigger = cloneElement(children, {
      "aria-describedby":
        [existing, visible ? tooltipId : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
    });
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={() => setVisible(false)}
    >
      {trigger}
      {visible ? (
        <span
          role="tooltip"
          id={tooltipId}
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-surface-raised px-sm py-xs text-caption text-text-primary shadow-panel animate-[var(--morpho-motion-fast)_var(--morpho-motion-ease)_morpho-tooltip-in]"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  variant: "info" | "success" | "warning" | "error";
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast dispatcher. Throws when used outside ToastProvider. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const toastVariantClasses: Record<ToastMessage["variant"], string> = {
  info: "border-info text-text-primary",
  success: "border-success text-text-primary",
  warning: "border-warning text-text-primary",
  error: "border-error text-text-primary",
};

/** Registered primitive: Toast — screen-reader announcements through a
 * polite live region; errors announce assertively. Auto-dismisses. Toasts
 * enter with the shared overlay rise (Guidance: the new notice draws the
 * eye); reduced-motion collapses the entrance globally. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div aria-live="polite" aria-atomic="false" data-testid="toast-region">
        {toasts
          .filter((t) => t.variant !== "error")
          .map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
      </div>
      <div aria-live="assertive" aria-atomic="false" data-testid="toast-region-error">
        {toasts
          .filter((t) => t.variant === "error")
          .map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  return (
    <div
      className={`fixed bottom-lg right-lg z-50 max-w-sm rounded-md border bg-surface-raised px-md py-sm shadow-panel animate-[var(--morpho-motion-base)_var(--morpho-motion-ease)_morpho-overlay-in] ${toastVariantClasses[toast.variant]}`}
    >
      <p className="text-label">{toast.title}</p>
      {toast.detail ? (
        <p className="text-caption text-text-secondary">{toast.detail}</p>
      ) : null}
    </div>
  );
}
