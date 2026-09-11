import { Badge, Button, Card, Checkbox, Label, Select } from "@morpho/ui";
import {
  DEFAULT_DIMENSIONS,
  DEPTH_LEVELS,
  RESEARCH_PURPOSES,
  type ResearchConfig,
  type ResearchDepth,
} from "@/types/domain";
import { DEPTH_LABELS, PURPOSE_LABELS, dimensionLabel } from "@/types/labels";

/* ------------------------------------------------------------------ */
/* ResearchDepthSelector                                               */
/* ------------------------------------------------------------------ */

/** Registered business component: ResearchDepthSelector. */
export function ResearchDepthSelector({
  value,
  onChange,
  disabled,
}: {
  value: ResearchDepth;
  onChange: (depth: ResearchDepth) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor="research-depth">研究深度（1–5）</Label>
      <Select
        id="research-depth"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) as ResearchDepth)}
      >
        {DEPTH_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {DEPTH_LABELS[level.value]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ResearchDimensionPicker                                             */
/* ------------------------------------------------------------------ */

/** Registered business component: ResearchDimensionPicker — defaults come
 * from the PRD dimension list; users may add custom dimensions. */
export function ResearchDimensionPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (dimensions: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (dimension: string) => {
    if (disabled) return;
    onChange(
      selected.includes(dimension)
        ? selected.filter((d) => d !== dimension)
        : [...selected, dimension],
    );
  };

  const customDimensions = selected.filter(
    (d) => !(DEFAULT_DIMENSIONS as readonly string[]).includes(d),
  );

  return (
    <fieldset className="flex flex-col gap-sm" disabled={disabled}>
      <legend className="mb-xs text-label text-text-secondary">
        研究维度（至少选择一个）
      </legend>
      <div className="flex flex-wrap gap-sm">
        {DEFAULT_DIMENSIONS.map((dimension) => (
          <Checkbox
            key={dimension}
            label={dimensionLabel(dimension)}
            checked={selected.includes(dimension)}
            onChange={() => toggle(dimension)}
          />
        ))}
      </div>
      {customDimensions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-sm">
          <span className="text-caption text-text-muted">自定义维度：</span>
          {customDimensions.map((dimension) => (
            <Badge key={dimension} variant="accent">
              {dimension}
              <button
                type="button"
                aria-label={`移除自定义维度 ${dimension}`}
                className="ml-1 text-text-secondary hover:text-text-primary"
                onClick={() => toggle(dimension)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Purpose selector                                                    */
/* ------------------------------------------------------------------ */

/** Purpose options from docs/PRD.md §5, kept canonical in data. */
export function PurposeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ResearchConfig["purpose"];
  onChange: (purpose: ResearchConfig["purpose"]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor="research-purpose">研究目的</Label>
      <Select
        id="research-purpose"
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value as ResearchConfig["purpose"])
        }
      >
        {RESEARCH_PURPOSES.map((purpose) => (
          <option key={purpose} value={purpose}>
            {PURPOSE_LABELS[purpose]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ResearchPlanTree                                                    */
/* ------------------------------------------------------------------ */

export interface PlanTreeNode {
  id: string;
  title: string;
  description: string;
  kind: string;
}

/** Registered business component: ResearchPlanTree — sections with editable
 * task drafts; editing only reaches the service while the plan is a draft. */
export function ResearchPlanTree({
  sections,
  editable,
  onEditTask,
}: {
  sections: Array<{
    id: string;
    title: string;
    dimension: string;
    rationale: string;
    objectives: string[];
    tasks: PlanTreeNode[];
  }>;
  editable: boolean;
  onEditTask?: (input: { sectionId: string; task: PlanTreeNode }) => void;
}) {
  return (
    <div className="flex flex-col gap-lg" data-testid="plan-tree">
      {sections.map((section) => (
        <Card key={section.id} className="flex flex-col gap-md">
          <div>
            <div className="flex items-center gap-sm">
              <h3 className="text-h3 text-text-primary">{section.title}</h3>
              <Badge variant="accent">{dimensionLabel(section.dimension)}</Badge>
            </div>
            <p className="mt-xs text-caption text-text-secondary">{section.rationale}</p>
            <ul className="mt-sm list-disc pl-lg text-caption text-text-secondary">
              {section.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </div>
          <ol className="flex flex-col gap-sm">
            {section.tasks.map((task, index) => (
              <li
                key={task.id}
                className="rounded-md border border-border/70 bg-surface-raised p-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-body text-text-primary">
                    {index + 1}. {task.title}
                  </span>
                  <Badge variant="neutral">{task.kind}</Badge>
                </div>
                <p className="mt-xs text-caption text-text-secondary">
                  {task.description}
                </p>
                {editable && onEditTask ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-sm"
                    onClick={() => onEditTask({ sectionId: section.id, task })}
                  >
                    编辑任务
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}
