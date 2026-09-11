# Component Registry
Every component records purpose, props, states, accessibility contract, owner, and examples. Existing business components must be reused; additions require rationale and a documentation entry. Registry is the review checklist for AI-generated UI.

## Implementation index (V0.1 first build)

Primitives live in `packages/ui/src/primitives/` and consume design tokens only (`Button.tsx`, `inputs.tsx` — Input/Textarea/Select/Checkbox/Field/Label, `overlays.tsx` — Dialog/Popover/Tooltip/Toast, `display.tsx` — Badge/Card/Table/Progress/Skeleton/Alert/Tabs). Each primitive ships keyboard, focus, disabled, and loading states with component tests.

Registered business components (`apps/desktop/src/`):

| Component | Location | Purpose | States |
|---|---|---|---|
| PageShell | `components/PageShell.tsx` | PageHeader/Toolbar/Content structure | static |
| PageStates (PageLoading/PageEmpty/PageError) | `components/PageStates.tsx` | Mandatory loading/empty/error rendering | loading, empty, error, content |
| ResearchStatusBadge | `components/cards.tsx` | Task/plan/confidence status badge | per documented vocabulary |
| TaskProgress | `components/cards.tsx` | Completed/total progress with Progress primitive | determinate/empty |
| SourceCard | `components/cards.tsx` | Source with URL, type, quality metadata | evaluated / pending quality |
| KnowledgeCard | `components/cards.tsx` | Node summary with type, confidence, counts | default |
| ClaimCard | `components/cards.tsx` | Claim statement with subject and scope | per confidence state |
| EvidenceList | `components/cards.tsx` | Evidence quotes with locator and direction | support/contradict, empty |
| TaskRow | `components/cards.tsx` | Task row with state-driven user actions | per TaskState |
| ResearchDepthSelector / ResearchDimensionPicker / PurposeSelect | `components/research.tsx` | Structured config controls (PRD §5) | disabled, checked |
| ResearchPlanTree | `components/research.tsx` | Plan sections with editable task drafts | draft (editable) / locked |
| GraphCanvas | `features/graph/GraphPage.tsx` | SVG 2D force graph with node selection | nodes/relations filtered, keyboard focus |
| GraphNodeInspector | `features/graph/GraphPage.tsx` | Selected node details and relations | open/closed |
| CoveragePanel | `features/gaps/GapsPage.tsx` | Explainable per-dimension coverage | formula components + reasons |
| GapCard | `features/gaps/GapsPage.tsx` | Gap rule, proposal, approve/dismiss | pending_approval / approved / dismissed |
| AssistantPanel | `features/assistant/AssistantPanel.tsx` | Project-bound assistant: explain progress, suggest next task, list pending reviews, record decision (explicit save) | loading, responding, error, saved |
| ProjectSwitcher | `app/layout/ProjectSwitcher.tsx` | Project list/create/switch popover | loading, empty, error |

Page specifications for every implemented view live under `docs/frontend/pages/`.
