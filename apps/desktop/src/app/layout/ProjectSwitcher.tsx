import { useProjects, useCreateProject, useAssistantContext } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button, Dialog, Input, Popover, Textarea } from "@morpho/ui";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Project switcher — the isolation boundary users touch. Creating or
 * switching a project swaps every query key and the assistant context.
 * Strings go through t() (ADR-023, "shell" namespace); project NAMES come
 * from user data and are interpolated, never translated.
 */
export function ProjectSwitcher() {
  const { t } = useTranslation("shell");
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Stable identity: Dialog re-runs its focus effect when onClose changes;
  // an inline closure would steal focus back to the first field on every
  // keystroke (the description textarea became untypeable).
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const active = projects?.find((p) => p.id === activeProjectId);

  async function submit() {
    if (!name.trim()) {
      setError(t("projectSwitcher.nameRequired"));
      return;
    }
    setError(null);
    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      });
      setActiveProject(created.id);
      setDialogOpen(false);
      setName("");
      setDescription("");
    } catch {
      setError(t("projectSwitcher.createFailed"));
    }
  }

  return (
    <div className="px-sm">
      <Popover
        align="start"
        trigger={({ onClick, "aria-expanded": expanded }) => (
          <Button
            variant="secondary"
            onClick={onClick}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            data-testid="project-switcher"
            className="h-auto w-full justify-start gap-sm bg-surface! px-md! py-sm text-left"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-accent-alt dot-glow-accent"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold text-text-primary">
                {isLoading
                  ? t("projectSwitcher.loading")
                  : (active?.name ?? t("projectSwitcher.noProjectSelected"))}
              </span>
              <span className="block text-caption text-text-muted">
                {t("projectSwitcher.researchProject")}
              </span>
            </span>
            <span aria-hidden="true" className="flex text-text-muted">
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                className={`transition-transform duration-[var(--morpho-motion-fast)] ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </span>
          </Button>
        )}
      >
        <div className="flex items-center justify-between px-md pb-sm pt-xs">
          <span className="kicker">{t("projectSwitcher.currentWorkspace")}</span>
          <Button
            variant="ghost"
            size="sm"
            data-testid="project-menu-manage"
            className="h-auto px-xs py-0 text-nano text-info!"
            onClick={() => setActiveView("projects")}
          >
            {t("projectSwitcher.manageAll")}
          </Button>
        </div>
        <div
          className="flex max-h-72 flex-col gap-xs overflow-y-auto"
          role="listbox"
          aria-label={t("projectSwitcher.projectListAria")}
        >
          {(projects ?? []).map((project) => (
            <ProjectMenuRow key={project.id} projectId={project.id} name={project.name} />
          ))}
          {(projects ?? []).length === 0 ? (
            <p className="px-md py-sm text-caption text-text-muted">
              {t("projectSwitcher.emptyProjects")}
            </p>
          ) : null}
        </div>
        <div className="mt-md border-t border-border pt-md">
          <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
            {t("projectSwitcher.newProject")}
          </Button>
        </div>
      </Popover>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={t("projectSwitcher.newProjectDialogTitle")}
        description={t("projectSwitcher.newProjectDialogDescription")}
      >
        <form
          className="flex flex-col gap-lg"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor="project-name" className="text-label text-text-secondary">
              {t("projectSwitcher.nameLabel")}{" "}
              <span aria-hidden="true" className="text-error">*</span>
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projectSwitcher.namePlaceholder")}
              aria-invalid={Boolean(error)}
              autoFocus
            />
            {error ? (
              <p role="alert" className="text-caption text-error">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="project-description" className="text-label text-text-secondary">
              {t("projectSwitcher.descriptionLabel")}
            </label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("projectSwitcher.descriptionPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("projectSwitcher.cancel")}
            </Button>
            <Button variant="primary" type="submit" loading={createProject.isPending}>
              {t("projectSwitcher.create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/** One prototype menu row: status dot + name + progress line, per-project query. */
function ProjectMenuRow({ projectId, name }: { projectId: string; name: string }) {
  const { t } = useTranslation("shell");
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const { data: context } = useAssistantContext(projectId);
  const isActive = projectId === activeProjectId;

  const total = context?.tasks_total ?? 0;
  const done = context?.tasks_completed ?? 0;
  const status =
    context?.plan_status === "none" || total === 0
      ? {
          label: t("projectSwitcher.status.draft"),
          dot: "dot-muted dot-glow-secondary",
        }
      : done < total
        ? {
            label: t("projectSwitcher.status.inProgress", {
              percent: total > 0 ? Math.round((done / total) * 100) : 0,
            }),
            dot: "bg-accent-alt dot-glow-accent",
          }
        : { label: t("projectSwitcher.status.paused", { percent: 100 }), dot: "bg-warning dot-glow-warning" };

  return (
    <Button
      variant="ghost"
      role="option"
      aria-selected={isActive}
      data-testid="project-menu-item"
      onClick={() => setActiveProject(projectId)}
      className={`h-auto w-full justify-start gap-sm border-0 px-md! py-sm text-left ${
        isActive ? "bg-accent-soft!" : "hover:bg-accent-soft!"
      }`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${status.dot}`} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-micro font-semibold text-text-primary">{name}</strong>
        <small className="block text-caption text-text-muted">{status.label}</small>
      </span>
      {isActive ? (
        <span aria-hidden="true" className="flex text-info">
          <Check size={16} strokeWidth={1.75} />
        </span>
      ) : null}
    </Button>
  );
}
