import { useProjects, useCreateProject } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button, Dialog, Input, Popover, Textarea } from "@morpho/ui";
import { useState } from "react";

/**
 * Project switcher — the isolation boundary users touch. Creating or
 * switching a project swaps every query key and the assistant context.
 */
export function ProjectSwitcher() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

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
            className="flex w-full items-center justify-between gap-sm rounded-md border border-border bg-surface-raised px-md py-sm text-left"
          >
            <span className="min-w-0">
              <span className="block text-caption text-text-muted">当前项目</span>
              <span className="block truncate text-label text-text-primary">
                {isLoading ? "加载中…" : (active?.name ?? "未选择项目")}
              </span>
            </span>
            <span aria-hidden="true" className="text-text-muted">
              ▾
            </span>
          </button>
        )}
      >
        <div className="flex max-h-72 flex-col gap-xs overflow-y-auto" role="listbox" aria-label="项目列表">
          {(projects ?? []).map((project) => (
            <button
              key={project.id}
              role="option"
              aria-selected={project.id === activeProjectId}
              onClick={() => setActiveProject(project.id)}
              className={`rounded-md px-md py-sm text-left text-body transition-colors duration-[var(--morpho-motion-fast)] ${
                project.id === activeProjectId
                  ? "bg-accent-soft text-text-primary"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary"
              }`}
            >
              {project.name}
            </button>
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
        onClose={() => setDialogOpen(false)}
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
