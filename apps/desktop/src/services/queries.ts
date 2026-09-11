import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { ResearchConfig, ResearchTask } from "@/types/domain";
import {
  assistantService,
  claimService,
  configService,
  coverageService,
  gapService,
  graphService,
  knowledgeService,
  planService,
  projectService,
  runService,
  sourceService,
  taskService,
  timelineService,
} from "./api";

/**
 * Centralized query keys (docs/frontend/AI_FRONTEND_RULES.md). Every key
 * includes the project id so switching projects can never leak another
 * project's data across caches.
 */

export const queryKeys = {
  projects: ["projects"] as const,
  project: (projectId: string) => ["project", projectId] as const,
  config: (projectId: string) => ["config", projectId] as const,
  plan: (projectId: string) => ["plan", projectId] as const,
  run: (projectId: string) => ["run", projectId] as const,
  tasks: (projectId: string) => ["tasks", projectId] as const,
  sources: (projectId: string) => ["sources", projectId] as const,
  knowledge: (projectId: string) => ["knowledge", projectId] as const,
  claims: (projectId: string) => ["claims", projectId] as const,
  evidence: (projectId: string, claimId: string) =>
    ["evidence", projectId, claimId] as const,
  graph: (projectId: string) => ["graph", projectId] as const,
  coverage: (projectId: string) => ["coverage", projectId] as const,
  gaps: (projectId: string) => ["gaps", projectId] as const,
  timeline: (projectId: string) => ["timeline", projectId] as const,
  assistantContext: (projectId: string) => ["assistant", "context", projectId] as const,
  assistantDecisions: (projectId: string) =>
    ["assistant", "decisions", projectId] as const,
};

/** Task states that mean "the run is still moving" — poll while active. */
const ACTIVE_TASK_STATES: ResearchTask["state"][] = [
  "PENDING",
  "PLANNING",
  "RUNNING",
  "VALIDATING",
  "PAUSED",
];

function isRunActive(tasks: ResearchTask[] | undefined): boolean {
  if (!tasks) return false;
  return tasks.some((t) => ACTIVE_TASK_STATES.includes(t.state));
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projectService.list(),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(projectId: string) {
  return useQuery({
    queryKey: queryKeys.plan(projectId),
    queryFn: () => planService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useConfig(projectId: string) {
  return useQuery({
    queryKey: queryKeys.config(projectId),
    queryFn: () => configService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useRun(projectId: string) {
  return useQuery({
    queryKey: queryKeys.run(projectId),
    queryFn: () => runService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useTasks(projectId: string) {
  const query = useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => taskService.list({ project_id: projectId }),
    enabled: projectId !== "",
    refetchInterval: (queryState) =>
      isRunActive(queryState.state.data) ? 900 : false,
  });
  return query;
}

export function useSources(projectId: string) {
  return useQuery({
    queryKey: queryKeys.sources(projectId),
    queryFn: () => sourceService.list({ project_id: projectId }),
    enabled: projectId !== "",
    refetchInterval: (queryState) =>
      queryState.state.data !== undefined && queryState.state.data.length === 0
        ? 900
        : false,
  });
}

export function useKnowledge(projectId: string) {
  return useQuery({
    queryKey: queryKeys.knowledge(projectId),
    queryFn: () => knowledgeService.list({ project_id: projectId }),
    enabled: projectId !== "",
    refetchInterval: (queryState) =>
      queryState.state.data !== undefined && queryState.state.data.length === 0
        ? 1200
        : false,
  });
}

export function useClaims(projectId: string) {
  return useQuery({
    queryKey: queryKeys.claims(projectId),
    queryFn: () => claimService.list({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useEvidence(projectId: string, claimId: string) {
  return useQuery({
    queryKey: queryKeys.evidence(projectId, claimId),
    queryFn: () => claimService.evidence(claimId, { project_id: projectId }),
    enabled: projectId !== "" && claimId !== "",
  });
}

export function useGraph(projectId: string) {
  return useQuery({
    queryKey: queryKeys.graph(projectId),
    queryFn: () => graphService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useCoverage(projectId: string) {
  return useQuery({
    queryKey: queryKeys.coverage(projectId),
    queryFn: () => coverageService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useGaps(projectId: string) {
  return useQuery({
    queryKey: queryKeys.gaps(projectId),
    queryFn: () => gapService.list({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useTimeline(projectId: string) {
  return useQuery({
    queryKey: queryKeys.timeline(projectId),
    queryFn: () => timelineService.get({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

export function useAssistantContext(projectId: string) {
  return useQuery({
    queryKey: queryKeys.assistantContext(projectId),
    queryFn: () => assistantService.context({ project_id: projectId }),
    enabled: projectId !== "",
    refetchInterval: 1500,
  });
}

export function useAssistantDecisions(projectId: string) {
  return useQuery({
    queryKey: queryKeys.assistantDecisions(projectId),
    queryFn: () => assistantService.listDecisions({ project_id: projectId }),
    enabled: projectId !== "",
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useCreateProject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (request: { name: string; description: string }) =>
      projectService.create(request),
    onSuccess: () => invalidate([queryKeys.projects]),
  });
}

export function useUpdateConfig(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (config: ResearchConfig) =>
      configService.update({ project_id: projectId, config }),
    onSuccess: () =>
      invalidate([queryKeys.config(projectId), queryKeys.assistantContext(projectId)]),
  });
}

export function usePlanActions(projectId: string) {
  const invalidate = useInvalidate();
  const refresh = () =>
    invalidate([
      queryKeys.plan(projectId),
      queryKeys.tasks(projectId),
      queryKeys.run(projectId),
      queryKeys.sources(projectId),
      queryKeys.knowledge(projectId),
      queryKeys.assistantContext(projectId),
    ]);

  const regenerate = useMutation({
    mutationFn: () => planService.regenerate({ project_id: projectId }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: () => planService.approve({ project_id: projectId }),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: () => planService.reject({ project_id: projectId }),
    onSuccess: refresh,
  });
  const updateTask = useMutation({
    mutationFn: (input: { task_id: string; title: string; description: string }) =>
      planService.updateTask({ project_id: projectId, ...input }),
    onSuccess: refresh,
  });

  return { regenerate, approve, reject, updateTask };
}

export function useRunActions(projectId: string) {
  const invalidate = useInvalidate();
  const start = useMutation({
    mutationFn: () => runService.start({ project_id: projectId }),
    onSuccess: () =>
      invalidate([
        queryKeys.run(projectId),
        queryKeys.tasks(projectId),
        queryKeys.assistantContext(projectId),
      ]),
  });
  return { start };
}

export function useTaskActions(projectId: string) {
  const invalidate = useInvalidate();
  const refresh = () =>
    invalidate([
      queryKeys.tasks(projectId),
      queryKeys.run(projectId),
      queryKeys.assistantContext(projectId),
    ]);
  const pause = useMutation({
    mutationFn: (taskId: string) =>
      taskService.pause({ project_id: projectId, task_id: taskId }),
    onSuccess: refresh,
  });
  const resume = useMutation({
    mutationFn: (taskId: string) =>
      taskService.resume({ project_id: projectId, task_id: taskId }),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (taskId: string) =>
      taskService.retry({ project_id: projectId, task_id: taskId }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (taskId: string) =>
      taskService.cancel({ project_id: projectId, task_id: taskId }),
    onSuccess: refresh,
  });
  return { pause, resume, retry, cancel };
}

export function useGapActions(projectId: string) {
  const invalidate = useInvalidate();
  const refresh = () =>
    invalidate([
      queryKeys.gaps(projectId),
      queryKeys.tasks(projectId),
      queryKeys.timeline(projectId),
      queryKeys.assistantContext(projectId),
    ]);
  const approve = useMutation({
    mutationFn: (gapId: string) =>
      gapService.act("gap.approveProposal", {
        project_id: projectId,
        gap_id: gapId,
      }),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (gapId: string) =>
      gapService.act("gap.dismissProposal", {
        project_id: projectId,
        gap_id: gapId,
      }),
    onSuccess: refresh,
  });
  return { approve, dismiss };
}

export function useAssistantActions(projectId: string) {
  const invalidate = useInvalidate();
  const act = useMutation({
    mutationFn: (
      action: "explain_progress" | "suggest_next_task" | "list_pending_reviews",
    ) => assistantService.act({ project_id: projectId, action }),
  });
  const saveDecision = useMutation({
    mutationFn: (content: string) =>
      assistantService.recordDecision({ project_id: projectId, content }),
    onSuccess: () => invalidate([queryKeys.assistantDecisions(projectId)]),
  });
  return { act, saveDecision };
}
