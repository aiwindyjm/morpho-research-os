import type { ReactNode } from "react";

export interface PageShellProps {
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
 */
export function PageShell({ title, description, actions, toolbar, children }: PageShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-xl py-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">{title}</h1>
            {description ? (
              <p className="mt-xs max-w-2xl text-body text-text-secondary">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-sm">{actions}</div> : null}
        </div>
        {toolbar ? <div className="mt-md">{toolbar}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-xl py-lg">{children}</div>
    </div>
  );
}
