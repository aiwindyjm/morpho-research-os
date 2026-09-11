对，这一点非常关键。

你说的“前端框架”我理解得更深一点：**不是仅仅选 React / Vue，而是要给 AI 一套“前端施工规范”**，让 Codex、GLM 以后实现页面时不能自由发挥。

否则很容易出现：

> 第一个页面很好看 → 第二个页面自己换一套布局 → 第三个页面按钮位置又变了 → 卡片、弹窗、颜色、间距全部开始漂移。

对于你这种**主要依靠 AI 开发**的项目，这几乎是必然发生的。

所以 Morpho Research OS 应该从一开始就建立一个：

# Frontend Design & Development Framework

它实际上分成 **4 层**：

```text
设计原则
   ↓
Design Tokens
   ↓
UI Component System
   ↓
Page Composition Rules
   ↓
AI Coding Rules
```

我建议把这一部分直接加入技术设计，甚至优先级比具体页面开发还高。

---

# 一、技术栈不要只是 React，而要形成固定组合

我建议 Morpho 前端锁死为：

```text
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
React Router
Zustand
TanStack Query
Zod
D3.js
```

架构：

```text
React
├── Router
├── Feature Modules
├── UI Components
├── Design Tokens
├── State
├── Data Layer
└── Visualization
```

这里的核心不是“这些库多先进”，而是：

> **以后 AI 只能在这套框架里施工。**

---

# 二、最重要的是建立 Design System

不要让 AI 自己决定：

> 这个页面用什么颜色？

> 卡片圆角多少？

> 按钮多大？

> 标题多大？

这些全部提前定义。

例如：

```text
design-system/
├── tokens.ts
├── colors.ts
├── spacing.ts
├── typography.ts
├── radius.ts
├── shadows.ts
└── motion.ts
```

---

# 三、Design Token

例如：

```ts
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};
```

以后 AI 不能写：

```css
margin: 13px;
padding: 17px;
```

除非明确有设计要求。

统一使用：

```text
space-xs
space-sm
space-md
space-lg
space-xl
```

---

# 四、颜色也不能让 AI 自己发挥

比如 Morpho 我建议走：

> **深色研究工作台 + 中性色 + 少量强调色**

定义：

```text
background
surface
surface-hover
border
text-primary
text-secondary
text-muted
accent
success
warning
error
info
```

AI 不允许：

```text
#ff4d6d
#16c784
#7367ff
```

到处乱加。

只能引用：

```text
--color-accent
--color-success
--color-warning
```

---

# 五、字体层级固定

例如：

```text
Display
H1
H2
H3
Body
Body Small
Caption
Label
```

规定：

```text
H1 → 28px
H2 → 22px
H3 → 18px
Body → 14px
Caption → 12px
```

具体数值可以后续调整。

重要的是：

> **只有 Design Token 能决定字体。**

---

# 六、建立自己的 UI Component Library

虽然使用 shadcn/ui，但不能让 AI 每次随便拼。

Morpho 自己应该拥有一层：

```text
components/
├── ui/
│
├── layout/
├── navigation/
├── research/
├── knowledge/
├── source/
├── task/
└── graph/
```

---

# 七、基础组件

比如：

```text
Button
Input
Textarea
Select
Checkbox
Radio
Switch
Dialog
Popover
Dropdown
Tooltip
Tabs
Badge
Card
Table
Progress
Skeleton
Alert
Toast
```

这些是：

> 原子组件。

---

# 八、再往上建立业务组件

这是非常重要的。

例如：

```text
ResearchDepthSelector
ResearchDimensionPicker
ResearchStatusBadge
TaskProgress
SourceCard
KnowledgeCard
ClaimCard
EvidenceList
GraphNodeInspector
ResearchPlanTree
CoveragePanel
```

以后 AI 做页面的时候：

### 不允许

自己重新写一个“研究深度选择器”。

### 必须

```tsx
<ResearchDepthSelector />
```

这样 UI 就不会越来越乱。

---

# 九、再往上是 Page Pattern

例如我们规定 Morpho 只有几类页面：

## Pattern A：Dashboard

```text
┌────────────────────────────┐
│ Page Header                │
├────────────────────────────┤
│ KPI / Summary              │
├────────────────────────────┤
│ Main Content               │
└────────────────────────────┘
```

---

## Pattern B：List

```text
┌────────────────────────────┐
│ Header + Actions           │
├────────────────────────────┤
│ Search / Filters           │
├────────────────────────────┤
│ List / Table               │
└────────────────────────────┘
```

---

## Pattern C：Workspace

这个是 Morpho 最核心的：

```text
┌───────────┬──────────────────────┬──────────────┐
│ Sidebar   │ Main Canvas          │ Inspector    │
│           │                      │              │
│           │                      │              │
└───────────┴──────────────────────┴──────────────┘
```

Research Graph、Task、Knowledge Explorer 都可以复用这个框架。

---

# 十、我们甚至可以规定页面网格

例如：

```text
App Window
│
├── Global Sidebar: 240px
│
└── Workspace
     ├── Main
     └── Inspector: 320px
```

当右侧 Inspector 没打开：

```text
Main = 100%
```

打开：

```text
Main = remaining width
Inspector = 320px
```

这样 AI 不能今天做 280px，明天 360px。

---

# 十一、建立“页面结构协议”

这个特别适合 Codex。

比如每一个页面必须满足：

```text
Page
├── PageHeader
├── PageToolbar
├── PageContent
└── OptionalInspector
```

所以：

### Research Overview

```tsx
<Page>
  <PageHeader />
  <PageToolbar />
  <PageContent>
    ...
  </PageContent>
</Page>
```

而不是让 Codex 自己决定：

```text
<div>
  <div>
    ...
```

---

# 十二、甚至页面都应该配置化

例如：

```ts
interface PageDefinition {
  id: string;
  title: string;
  pattern: "dashboard" | "list" | "workspace";
  navigation: boolean;
  inspector?: boolean;
}
```

Research Graph：

```ts
{
  id: "research-graph",
  pattern: "workspace",
  inspector: true
}
```

---

# 十三、AI Coding Rules

我建议项目根目录直接放：

```text
AGENTS.md
```

专门给 Codex。

然后：

```text
docs/
├── frontend/
│   ├── DESIGN_SYSTEM.md
│   ├── UI_COMPONENTS.md
│   ├── PAGE_PATTERNS.md
│   ├── UX_RULES.md
│   └── AI_FRONTEND_RULES.md
```

---

# 十四、AI_FRONTEND_RULES.md

里面直接规定：

```text
1. Do not introduce a new UI library.

2. Do not create custom buttons when Button exists.

3. Do not use arbitrary colors.

4. Do not use arbitrary spacing values.

5. Do not create page-specific navigation patterns.

6. Reuse existing layout patterns.

7. Business components must live under features/.

8. Generic components must live under components/ui/.

9. New reusable components must be added to UI documentation.

10. Do not change global design tokens for a local requirement.

11. Do not introduce Redux.

12. Do not introduce another state-management library.

13. Do not introduce another CSS framework.

14. Do not redesign an existing page unless explicitly requested.
```

这对你特别重要。

---

# 十五、再加一个东西：Component Registry

建立：

```text
docs/frontend/component-registry.md
```

例如：

| Component     | 用途   | 禁止重新实现 |
| ------------- | ---- | ------ |
| Button        | 操作按钮 | 是      |
| Modal         | 弹窗   | 是      |
| SourceCard    | 来源   | 是      |
| TaskProgress  | 任务进度 | 是      |
| KnowledgeCard | 知识节点 | 是      |
| PageHeader    | 页面标题 | 是      |
| Inspector     | 右侧详情 | 是      |

以后 GLM 接到：

> “做一个 Sources 页面”

它应该首先查：

```text
Component Registry
```

而不是自己造组件。

---

# 十六、给 AI 一个“先查后写”的前端规则

这个我非常建议写死：

```text
Before implementing any UI feature:

1. Inspect existing components.
2. Inspect page patterns.
3. Inspect design tokens.
4. Reuse existing components whenever possible.
5. Only create a new component when no suitable component exists.
6. Document why the new component is necessary.
```

这会明显减少 AI 发散。

---

# 十七、甚至可以让 Codex 有一个 Frontend Goal Mode

以后你给 Codex：

> 实现 Research Project 页面。

不要让它自由设计。

给它：

```text
Frontend Task Specification

Page:
Research Project

Pattern:
Workspace

Layout:
Sidebar + Main + Inspector

Existing Components:
PageHeader
Tabs
ResearchStatusBadge
TaskProgress
SourceCard

Required Sections:
1. Overview
2. Research Progress
3. Tasks
4. Sources

Do Not:
- add new navigation
- create new design tokens
- change global styles
- introduce new packages
```

这样成功率会高很多。

---

# 十八、我建议甚至建立“页面规格文件”

比如：

```text
features/projects/pages/
├── ProjectList.spec.md
├── ProjectOverview.spec.md
└── NewResearch.spec.md
```

例如：

```md
# New Research Page

Pattern:
Form

Purpose:
Create a research project.

Sections:

1. Basic Information
2. Research Purpose
3. Research Depth
4. Research Dimensions
5. Source Preferences
6. Advanced Options

Actions:

Primary:
Start Research

Secondary:
Save Draft
Cancel
```

于是：

> **PRD 决定“做什么”，Page Spec 决定“页面怎么做”，Design System 决定“长什么样”，AI Rules 决定“AI 怎么写”。**

这四层非常清楚。

---

# 十九、整个前端开发体系就变成

```text
                 Product PRD
                     │
                     ↓
              Feature Spec
                     │
                     ↓
               Page Spec
                     │
                     ↓
            Design System
                     │
                     ↓
             Component Library
                     │
                     ↓
              React Feature
                     │
                     ↓
                  Tauri
```

而 AI：

```text
           Codex / GLM
                │
                ↓
        读取上述全部规范
                │
                ↓
        修改现有代码优先
                │
                ↓
       新组件必须有理由
```

这就是你真正需要的“前端框架”。

---

# 二十、我还建议增加一个“禁止 AI 创作”的原则

这一条特别适合你的开发方式：

> **AI 可以实现设计，但不能擅自设计产品。**

也就是：

### AI 可以：

```text
实现
重构
补全
修复
适配
复用
```

### AI 不可以自行决定：

```text
产品信息架构
页面布局体系
交互范式
颜色体系
导航结构
数据模型
核心用户流程
```

这些必须来自：

> PRD / Page Spec / Design System。

---

# 二十一、这样以后你给 GLM 的任务会非常舒服

例如不要说：

> 做一个很好看的研究项目页面。

而说：

> 按 `docs/frontend/PAGE_PATTERNS.md` 中的 Workspace Pattern，实现 `ProjectOverview`。复用 `ResearchStatusBadge`、`TaskProgress`、`SourceCard`；不得新增 UI 库、不得修改 Design Token；完成后更新 Component Registry。

这时候 GLM 就变成：

> **施工队**

而 Codex 更像：

> **技术负责人 / 审查者**

你自己：

> **产品经理 + 总设计师**

这非常符合你现在的工作方式。

---

# 二十二、因此我建议修改之前的技术设计

原来的：

```text
React
TypeScript
Tailwind
D3
Zustand
```

不够。

正式改成：

```text
Frontend Engineering Framework

├── React + TypeScript
│
├── Vite
│
├── Tailwind
│
├── shadcn/ui
│
├── React Router
│
├── Zustand
│
├── TanStack Query
│
├── Zod
│
├── D3.js
│
├── Design Tokens
│
├── UI Component Library
│
├── Page Patterns
│
├── Page Specifications
│
├── Component Registry
│
└── AGENTS.md / AI Frontend Rules
```

这样才真正能支撑你后面：

**Codex 做架构 + GLM 大量写代码 + 你做产品控制。**

而且这件事情我认为应该放到项目最早期。**在让 GLM 开始大量写 UI 之前，先把 Design System、Component Registry、Page Pattern 和 AGENTS.md 建起来。**否则第一轮代码一旦跑起来，后面再统一视觉和结构，AI 重构的成本会比一开始规范高很多。
