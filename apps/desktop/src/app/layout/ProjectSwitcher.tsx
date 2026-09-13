import { useProjects, useCreateProject, useAssistantContext } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button, Dialog, Input, Popover, Textarea } from "@morpho/ui";
import { useCallback, useState } from "react";

/**
 * Project switcher — the isolation boundary users touch. Creating or
 * switching a project swaps every query key and the assistant context.
 */
export function ProjectSwitcher() {
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
      setError("项目名称不能为空。");
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
      setError("创建失败，请重试。");
    }
  }

  return (
    <div className="px-sm">
      <Popover
        align="start"
        trigger={({ onClick, "aria-expanded": expanded }) => (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            data-testid="project-switcher"
            className="flex w-full items-center gap-sm rounded-md border border-border bg-surface px-md py-sm text-left"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-accent-alt dot-glow-accent"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold text-text-primary">
                {isLoading ? "加载中…" : (active?.name ?? "未选择项目")}
              </span>
              <span className="block text-caption text-text-muted">Research project</span>
            </span>
            <span aria-hidden="true" className="text-text-muted">
              ⌄
            </span>
          </button>
        )}
      >
        <div className="flex items-center justify-between px-md pb-sm pt-xs">
          <span className="kicker">当前工作区</span>
          <button
            type="button"
            data-testid="project-menu-manage"
            className="text-nano text-info"
            onClick={() => setActiveView("projects")}
          >
            管理全部
          </button>
        </div>
        <div className="flex max-h-72 flex-col gap-xs overflow-y-auto" role="listbox" aria-label="项目列表">
          {(projects ?? []).map((project) => (
            <ProjectMenuRow key={project.id} projectId={project.id} name={project.name} />
          ))}
          {(projects ?? []).length === 0 ? (
            <p className="px-md py-sm text-caption text-text-muted">
              还没有项目，先创建一个吧。
            </p>
          ) : null}
        </div>
        <div className="mt-md border-t border-border pt-md">
          <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
            新建项目
          </Button>
        </div>
      </Popover>

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
            void submit();
          }}
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor="project-name" className="text-label text-text-secondary">
              项目名称 <span aria-hidden="true" className="text-error">*</span>
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：大语言模型推理优化"
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
              项目描述
            </label>
            <Textarea
              id="project-description"
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
    </div>
  );
}

/** One prototype menu row: status dot + name + progress line, per-project query. */
function ProjectMenuRow({ projectId, name }: { projectId: string; name: string }) {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const { data: context } = useAssistantContext(projectId);
  const isActive = projectId === activeProjectId;

  const total = context?.tasks_total ?? 0;
  const done = context?.tasks_completed ?? 0;
  const status =
    context?.plan_status === "none" || total === 0
      ? { label: "草稿 · 尚未运行", dot: "dot-muted dot-glow-secondary" }
      : done < total
        ? { label: `进行中 · ${total > 0 ? Math.round((done / total) * 100) : 0}%`, dot: "bg-accent-alt dot-glow-accent" }
        : { label: "已暂停 · 100%", dot: "bg-warning dot-glow-warning" };

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      data-testid="project-menu-item"
      onClick={() => setActiveProject(projectId)}
      className={`flex w-full items-center gap-sm rounded-md px-md py-sm text-left ${
        isActive ? "bg-accent-soft" : "hover:bg-accent-soft"
      }`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${status.dot}`} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-micro font-semibold text-text-primary">{name}</strong>
        <small className="block text-caption text-text-muted">{status.label}</small>
      </span>
      {isActive ? (
        <span aria-hidden="true" className="text-caption text-info">
          ✓
        </span>
      ) : null}
    </button>
  );
}
