import { useCallback, useState } from "react";
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
 * create dialog.
 */
export function ProjectsPage() {
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
      setDialogError("项目名称不能为空。");
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
      setDialogError("创建失败，请重试。");
    }
  }

  const openCreateDialog = (
    <Button variant="primary" onClick={() => setDialogOpen(true)}>
      ＋ 新建研究
    </Button>
  );

  return (
    <PageShell
      kicker="我的研究"
      title="所有研究项目"
      description="每个主题都是一个独立的研究空间。你可以随时切换、继续或新建研究。"
      actions={openCreateDialog}
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={projectList.length === 0}
        empty={{
          title: "还没有研究项目",
          description: "创建第一个项目，把一个研究问题变成可持续生长的知识库。",
          action: openCreateDialog,
        }}
      >
        <div className="flex flex-col gap-lg">
          {/* 工具条：搜索 + 计数 */}
          <div className="flex items-center justify-between border-y border-border py-md">
            <div className="flex items-center gap-sm">
              <span aria-hidden="true" className="text-text-muted">
                ⌕
              </span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索我的研究"
                aria-label="搜索我的研究"
                className="w-64 border-none bg-transparent text-body text-text-primary placeholder:text-text-muted"
              />
            </div>
            <span className="text-caption text-text-muted">
              {filtered.length} 个项目
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
            <button
              type="button"
              data-testid="new-project-card"
              onClick={() => setDialogOpen(true)}
              className="flex min-h-[190px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-lg text-center transition-colors hover:border-accent"
            >
              <span aria-hidden="true" className="text-[25px] text-info">
                ＋
              </span>
              <strong className="text-label text-text-primary">
                新建一个研究
              </strong>
              <small className="mt-xs text-caption text-text-muted">
                从一个问题开始
              </small>
            </button>
          </div>
        </div>
      </PageStates>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title="新建研究项目"
        description="每个项目拥有独立的配置、计划、任务、知识与助手上下文。"
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
              项目名称 <span aria-hidden="true" className="text-error">*</span>
            </label>
            <Input
              id="projects-page-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：大语言模型推理优化"
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
              项目描述
            </label>
            <Textarea
              id="projects-page-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明这个项目要回答什么问题"
            />
          </div>
          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button variant="primary" type="submit" loading={createProject.isPending}>
              创建项目
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
  const { data: context } = useAssistantContext(projectId);

  const total = context?.tasks_total ?? 0;
  const done = context?.tasks_completed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const status =
    context === undefined || context.plan_status === "none" || total === 0
      ? { label: "草稿", pill: "pill pill-neutral" }
      : done < total
        ? { label: "进行中", pill: "pill pill-success" }
        : { label: "已暂停", pill: "pill pill-warning" };

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
        <button
          type="button"
          aria-label="打开项目"
          onClick={onOpen}
          className="rounded px-xs text-body text-text-muted hover:text-text-primary"
        >
          ⋯
        </button>
      </div>
      <h2 className="mt-md text-subhead font-semibold leading-tight text-text-primary">
        {name}
      </h2>
      <p className="mt-xs min-h-[45px] text-caption leading-relaxed text-text-secondary">
        {description}
      </p>
      <div className="mt-md flex flex-wrap gap-md text-caption text-text-muted">
        <span>{total > 0 ? `${pct}% 覆盖` : "未开始"}</span>
        <span>{total} 任务</span>
        <span>更新于 {updatedAt.slice(0, 10)}</span>
      </div>
      <div className="mt-auto pt-md">
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="项目进度"
        >
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-md flex gap-sm">
        <Button size="sm" variant={active ? "secondary" : "primary"} onClick={onOpen}>
          {active ? "进入工作台" : "切换到此项目"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onConfigure}>
          研究配置
        </Button>
      </div>
    </Card>
  );
}
