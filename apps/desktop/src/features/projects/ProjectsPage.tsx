import { Badge, Button, Card } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { PageStates } from "@/components/PageStates";
import { TaskProgress } from "@/components/cards";
import { PLAN_STATUS_LABELS } from "@/types/labels";
import {
  useAssistantContext,
  useCreateProject,
  useProjects,
} from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Projects view — the list/create/switch entry (List pattern). Every
 * project is an isolated workspace; switching projects swaps all data.
 */
export function ProjectsPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const createProject = useCreateProject();

  return (
    <PageShell
      title="项目"
      description="每个研究项目拥有独立的配置、计划、任务、知识与助手上下文，互不影响。"
      actions={
        <Button
          variant="primary"
          onClick={() => {
            void createProject
              .mutateAsync({
                name: `新研究项目 ${(projects?.length ?? 0) + 1}`,
                description: "",
              })
              .then((created) => {
                setActiveProject(created.id);
                setActiveView("config");
              })
              .catch(() => undefined);
          }}
          loading={createProject.isPending}
        >
          新建项目
        </Button>
      }
    >
      <PageStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(projects ?? []).length === 0}
        empty={{
          title: "还没有研究项目",
          description: "创建第一个项目，把一个研究问题变成可持续生长的知识库。",
          action: (
            <Button variant="primary">使用右上角「新建项目」开始</Button>
          ),
        }}
      >
        <ul className="grid grid-cols-1 gap-lg md:grid-cols-2 xl:grid-cols-3">
          {(projects ?? []).map((project) => (
            <li key={project.id}>
              <ProjectCard
                projectId={project.id}
                name={project.name}
                description={project.description}
                updatedAt={project.updated_at}
                active={project.id === activeProjectId}
                onOpen={() => setActiveProject(project.id)}
                onConfigure={() => {
                  setActiveProject(project.id);
                  setActiveView("config");
                }}
              />
            </li>
          ))}
        </ul>
      </PageStates>
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

  return (
    <Card
      className={`flex h-full flex-col gap-md ${active ? "border-accent" : ""}`}
      data-testid="project-card"
    >
      <div className="flex items-start justify-between gap-sm">
        <h2 className="text-h2 text-text-primary">{name}</h2>
        {active ? <Badge variant="accent">当前项目</Badge> : null}
      </div>
      {description ? (
        <p className="text-body text-text-secondary">{description}</p>
      ) : null}
      {context ? (
        <div className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm">
            {context.plan_status !== "none" ? (
              <Badge variant="neutral">
                计划：{PLAN_STATUS_LABELS[context.plan_status]}
              </Badge>
            ) : (
              <Badge variant="warning">未生成计划</Badge>
            )}
            {context.pending_reviews > 0 ? (
              <Badge variant="warning">{context.pending_reviews} 项待审核</Badge>
            ) : null}
          </div>
          {context.tasks_total > 0 ? (
            <TaskProgress
              completed={context.tasks_completed}
              total={context.tasks_total}
            />
          ) : null}
        </div>
      ) : null}
      <p className="text-caption text-text-muted">
        更新于 {updatedAt.slice(0, 10)}
      </p>
      <div className="mt-auto flex gap-sm">
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
