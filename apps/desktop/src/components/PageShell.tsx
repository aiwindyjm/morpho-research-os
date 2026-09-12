import type { ReactNode } from "react";

export interface PageShellProps {
  kicker?: string;
  title: string;
  description?: string;
  /** Toolbar actions rendered on the header row. */
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Fixed page structure from docs/frontend/PAGE_PATTERNS.md:
 * PageHeader → optional PageToolbar → PageContent.
 * Prototype alignment (spec §4): uppercase kicker above the display title,
 * borderless header blending into the scroll area.
 */
export function PageShell({ kicker, title, description, actions, toolbar, children }: PageShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="px-xl pt-xl">
        <div className="flex flex-wrap items-start justify-between gap-lg">
          <div className="max-w-2xl">
            {kicker ? <p className="kicker mb-xs">{kicker}</p> : null}
            <h1 className="text-display text-text-primary">{title}</h1>
            {description ? (
              <p className="mt-sm text-caption text-text-secondary">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-sm pt-lg">{actions}</div> : null}
        </div>
        {toolbar ? <div className="mt-lg">{toolbar}</div> : null}
      </header>
      {/* Layout-level view-fade already animates view switches; no second fade here. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-xl py-xl">{children}</div>
    </div>
  );
}
