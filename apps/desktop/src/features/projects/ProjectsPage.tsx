import { useCallback, useState } from "react";
import { Ellipsis, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Dialog, Input, Textarea } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import {
  useAssistantContext,
  useCreateProject,
  useProjects,
} from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Projects view — the prototype `view-projects` list/create/switch entry
 * (List pattern). Every project is an isolated workspace; switching
 * projects swaps all data. Client-side search filters by name and
 * description; the dashed card and the header action open the same
 * create dialog. All chrome strings go through t() (ADR-023, "projects"
 * namespace).
 */
export function ProjectsPage() {
  const { t } = useTranslation("projects");
  const { data: projects, isLoading, error, refetch } = useProjects();
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const createProject = useCreateProject();

  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Stable identity: Dialog re-runs its focus effect when onClose changes;
  // an inline closure would steal focus back to the first field on every
  // keystroke (the description textarea became untypeable).
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const projectList = projects ?? [];
  const filtered = projectList.filter(
    (p) => p.name.includes(query) || p.description.includes(query),
  );

  async function submitCreate() {
    if (!name.trim()) {
      setDialogError(t("error.nameRequired"));
      return;
    }
    setDialogError(null);
    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      });
      setActiveProject(created.id);
      setDialogOpen(false);
      setName("");
      setDescription("");
      setActiveView("config");
    } catch {
      setDialogError(t("error.createFailed"));
    }
  }

  const openCreateDialog = (
    <Button variant="primary" onClick={() => setDialogOpen(true)}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      {t("newResearch")}
    </Button>
  );

  return (
    <PageShell
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      actions={openCreateDialog}
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={projectList.length === 0}
        empty={{
          title: t("empty.title"),
          description: t("empty.description"),
          action: openCreateDialog,
        }}
      >
        <div className="flex flex-col gap-lg">
          {/* 工具条：搜索 + 计数 */}
          <div className="flex items-center justify-between border-y border-border py-md">
            <div className="flex items-center gap-sm">
              <span aria-hidden="true" className="flex text-text-muted">
                <Search size={16} strokeWidth={1.75} />
              </span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="w-64 border-none bg-transparent text-body text-text-primary placeholder:text-text-muted"
              />
            </div>
            <span className="text-caption text-text-muted">
              {t("count", { total: filtered.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                projectId={project.id}
                name={project.name}
                description={project.description}
                updatedAt={project.updated_at}
                active={project.id === activeProjectId}
                onOpen={() => {
                  // "打开项目" must leave the list: switch the isolated
                  // workspace AND land on its overview.
                  setActiveProject(project.id);
                  setActiveView("overview");
                }}
                onConfigure={() => {
                  setActiveProject(project.id);
                  setActiveView("config");
                }}
              />
            ))}
            <Button
              variant="ghost"
              data-testid="new-project-card"
              onClick={() => setDialogOpen(true)}
              className="h-auto min-h-[190px] w-full flex-col border-dashed border-border! p-lg text-center hover:border-accent!"
            >
              <span aria-hidden="true" className="flex text-info">
                <Plus size={18} strokeWidth={1.75} />
              </span>
              <strong className="text-label text-text-primary">
                {t("createCard.title")}
              </strong>
              <small className="mt-xs text-caption text-text-muted">
                {t("createCard.hint")}
              </small>
            </Button>
          </div>
        </div>
      </PageStates>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={t("dialog.title")}
        description={t("dialog.description")}
      >
        <form
          className="flex flex-col gap-lg"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreate();
          }}
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor="projects-page-project-name" className="text-label text-text-secondary">
              {t("dialog.nameLabel")} <span aria-hidden="true" className="text-error">*</span>
            </label>
            <Input
              id="projects-page-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dialog.namePlaceholder")}
              aria-invalid={Boolean(dialogError)}
              autoFocus
            />
            {dialogError ? (
              <p role="alert" className="text-caption text-error">
                {dialogError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-xs">
            <label
              htmlFor="projects-page-project-description"
              className="text-label text-text-secondary"
            >
              {t("dialog.descriptionLabel")}
            </label>
            <Textarea
              id="projects-page-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("dialog.descriptionPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("dialog.cancel")}
            </Button>
            <Button variant="primary" type="submit" loading={createProject.isPending}>
              {t("dialog.create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}

function ProjectCard({
  projectId,
  name,
  description,
  updatedAt,
  active,
  onOpen,
  onConfigure,
}: {
  projectId: string;
  name: string;
  description: string;
  updatedAt: string;
  active: boolean;
  onOpen: () => void;
  onConfigure: () => void;
}) {
  const { t } = useTranslation("projects");
  const { data: context } = useAssistantContext(projectId);

  const total = context?.tasks_total ?? 0;
  const done = context?.tasks_completed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const status =
    context === undefined || context.plan_status === "none" || total === 0
      ? { label: t("card.statusDraft"), pill: "pill pill-neutral" }
      : done < total
        ? { label: t("card.statusInProgress"), pill: "pill pill-success" }
        : { label: t("card.statusPaused"), pill: "pill pill-warning" };

  return (
    <Card
      data-testid="project-card"
      className={`relative flex h-full min-h-[190px] flex-col overflow-hidden p-lg ${
        active
          ? "card-active-accent"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-sm">
        <span className={status.pill}>{status.label}</span>
        <Button size="icon" variant="ghost" aria-label={t("card.openAria")} onClick={onOpen}>
          <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
      <h2 className="mt-md text-subhead font-semibold leading-tight text-text-primary">
        {name}
      </h2>
      <p className="mt-xs min-h-[45px] text-caption leading-relaxed text-text-secondary">
        {description}
      </p>
      <div className="mt-md flex flex-wrap gap-md text-caption text-text-muted">
        <span>{total > 0 ? t("card.coverage", { percent: pct }) : t("card.notStarted")}</span>
        <span>{t("card.taskCount", { total })}</span>
        <span>{t("card.updatedAt", { date: updatedAt.slice(0, 10) })}</span>
      </div>
      <div className="mt-auto pt-md">
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("card.progressAria")}
        >
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-md flex gap-sm">
        <Button size="sm" variant={active ? "secondary" : "primary"} onClick={onOpen}>
          {active ? t("card.enterWorkspace") : t("card.switchTo")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onConfigure}>
          {t("card.configure")}
        </Button>
      </div>
    </Card>
  );
}
