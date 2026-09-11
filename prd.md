

#PRD：Morpho Research OS

**版本：V0.1 产品需求文档**  
**产品定位：AI 驱动的自动化研究与个人知识库生成工具**  
**核心理念：Turn a research question into a living knowledge base.**

---

# 1. 产品概述

## 1.1 产品名称

暂定：

**Morpho Research OS**

可选项目仓库名称：

```text
morpho-research
research-os
research-vault
```

最终品牌与仓库名可以后续再确定。

---

## 1.2 产品一句话定义

> 用户只需要定义“研究什么、为什么研究、研究多深、从哪些维度研究”，系统即可自动规划研究任务、搜索和筛选资料、提取结构化知识、建立知识关系，并生成一个可持续更新的本地知识库。

---

## 1.3 产品核心价值

传统 AI Research 通常是：

```text
用户提问
↓
AI 搜索
↓
AI 回答
↓
得到一篇文章
↓
对话结束
```

本产品希望变成：

```text
用户定义研究目标
↓
AI 制定研究计划
↓
自动执行大量研究任务
↓
发现资料
↓
筛选资料
↓
提取知识
↓
交叉验证
↓
建立知识关系
↓
生成 Markdown 知识库
↓
生成知识图谱
↓
持续更新
```

核心区别：

**输出不是“一次性答案”，而是“可持续演进的研究知识资产”。**

---

# 2. 产品愿景

最终希望形成：

> 一个可以把“研究问题”自动转化为“结构化、可追溯、可持续更新的知识空间”的 AI Research OS。

最终用户可以：

```text
输入：
“我要研究脑机接口，用于给大学生讲课”

系统自动产生：

研究框架
+
知识库
+
论文资料库
+
人物
+
机构
+
技术路线
+
时间线
+
争议
+
最新进展
+
引用来源
+
可视化研究地图
```

用户最终拥有的是自己的知识资产，而不是被锁定在某个 AI 平台里的聊天记录。

---

# 3. 产品目标

## 3.1 V0.1 必须实现的目标

用户可以：

1. 创建一个研究项目

2. 输入研究方向、主题、目的

3. 设置研究深度

4. 设置研究维度

5. 设置资料来源偏好

6. 启动自动研究

7. 查看研究任务进度

8. 查看 AI 当前正在做什么

9. 查看发现的来源

10. 查看抽取出来的知识

11. 查看知识之间的关系

12. 自动生成 Markdown 文件

13. 自动生成 Obsidian Vault

14. 使用 Obsidian 打开生成结果

15. 使用网页查看知识图谱

16. 查看研究来源及引用关系

17. 手动重新运行某一研究任务

---

# 4. 非目标

V0.1 明确**不做**：

- 完整商业化 SaaS

- 在线多人协作

- 用户账号体系

- 支付

- 企业权限体系

- 大规模云端数据库

- 自建搜索引擎

- 自研大模型

- 自研向量数据库

- 全自动生成学术论文

- 替代专业科研工具

- 直接替代 Obsidian

- 梦境数据库功能

- AI 创剧功能

这些以后可以做，但不能污染第一版。

---

# 5. 目标用户

## 5.1 第一目标用户

### 知识型个人用户

例如：

- 产品经理

- 程序员

- 独立开发者

- 咨询顾问

- 教师

- 学生

- 内容创作者

- 投资研究者

- 行业研究人员

典型用户特征：

> 经常需要花大量时间搜资料，但最终资料散落在浏览器、PDF、Word、Notion、Obsidian、聊天记录中。

---

## 5.2 第二目标用户

### ToB/咨询研究人员

例如：

- 战略咨询

- 企业数字化咨询

- 政府产业研究

- 市场研究

- 技术路线研究

- 行业分析

这类用户的需求是：

> 面对一个新领域，需要迅速建立完整认知。

---

## 5.3 第三目标用户

### 教师 / 课程开发者

例如：

> 我要做一门《人工智能产业发展》课程。

系统自动形成：

```text
基础知识
↓
历史
↓
核心技术
↓
产业链
↓
代表企业
↓
案例
↓
争议
↓
最新进展
```

然后可以进一步生成：

- 讲义

- PPT 大纲

- 课程结构

- 阅读资料

但 V0.1 只负责知识库。

---

# 6. 核心用户场景

## 场景 A：快速学习一个陌生领域

用户：

> 我想系统学习量子计算。

输入：

```text
领域：物理
主题：量子计算
目的：建立个人知识体系
深度：4
维度：历史、理论、技术、应用、产业、人物
```

系统自动生成研究库。

---

## 场景 B：为授课准备材料

```text
研究方向：脑机接口
目的：大学课程
深度：4
维度：
基础
历史
技术
实验
产业
最新进展
争议
```

输出知识库。

---

## 场景 C：企业行业研究

```text
研究方向：新能源汽车
目的：战略规划
深度：5
维度：
政策
产业链
市场
技术
企业
竞争
投资
未来趋势
```

---

## 场景 D：持续追踪

例如：

> 半导体先进封装

系统每天/每周自动扫描：

```text
新论文
新公司
新技术
新政策
新产品
新事件
```

更新已有知识库。

---

# 7. 产品核心概念

整个系统围绕 8 个核心对象设计。

```text
Research Project
Research Plan
Research Task
Source
Knowledge
Entity
Relation
Artifact
```

---

# 8. Research Project：研究项目

一个用户研究主题对应一个 Project。

例如：

```text
Project:
脑机接口

Purpose:
大学课程

Depth:
4

Dimensions:
基础理论
技术
实验
产业
政策
最新进展
```

项目目录：

```text
Brain-Computer-Interface/
```

---

# 9. Research Configuration

这是产品非常关键的设计。

研究不是一个 Prompt，而是一组结构化参数。

建议：

```yaml
research:
  domain:
  topic:
  purpose:
  audience:
  depth:
  dimensions:
  time_range:
  geographic_scope:
  languages:
  source_types:
  source_domains:
  update_frequency:
```

---

# 10. Research 深度设计

建议第一版使用 5 级。

### Level 1：概览

目标：

> 快速知道是什么。

输出：

- 定义

- 核心概念

- 主要应用

- 关键人物

- 入门资料

---

### Level 2：知识级

目标：

> 能系统理解这个领域。

增加：

- 历史

- 核心概念

- 技术原理

- 应用

- 代表机构

---

### Level 3：系统级

目标：

> 建立较完整的专业认知。

增加：

- 技术路线

- 关键论文

- 重要实验

- 产业链

- 竞争关系

- 争议

---

### Level 4：专业研究级

增加：

- 多来源交叉验证

- 重要论文深入分析

- 方法比较

- 时间演进

- 技术路线比较

- 主要研究机构

- 研究空白

---

### Level 5：前沿研究级

目标：

> 尽可能接近专家级研究框架。

增加：

- 大量论文

- 多轮验证

- 争议观点

- 相反证据

- 最新研究

- 研究趋势

- 潜在研究方向

- 知识缺口

注意：

**Level 5 不应该承诺“等于专业科研”。**

系统必须明确：

> AI 研究结果需要人工验证。

---

# 11. Research Dimension 设计

默认提供：

```text
□ 基础概念
□ 历史发展
□ 理论体系
□ 核心技术
□ 实验方法
□ 关键论文
□ 人物
□ 机构
□ 企业
□ 产品
□ 应用
□ 产业链
□ 政策
□ 市场
□ 投融资
□ 争议
□ 风险
□ 最新进展
□ 未来趋势
```

用户可以自定义维度。

例如：

### 研究航空航天

选择：

```text
历史
技术
企业
政策
产业链
国家比较
最新进展
```

---

# 12. Research Purpose

提供预设：

```text
学习
授课
写作
科研
行业研究
投资研究
产品研究
战略规划
市场调研
内容创作
建立知识库
```

同时允许：

> 自定义目的。

Purpose 会直接影响研究计划。

例如：

### Purpose = 授课

系统自动增加：

```text
基础概念
学习难点
常见误解
教学顺序
案例
```

---

# 13. Research Planner

点击：

> 开始研究

第一步不是搜索。

AI 先生成：

# Research Plan

例如：

```text
脑机接口研究计划

01 基础
02 历史
03 神经信号
04 EEG
05 invasive BCI
06 non-invasive BCI
07 核心企业
08 主要实验室
09 临床应用
10 消费应用
11 政策
12 最新进展
13 争议
14 未来趋势
```

用户可以：

```text
编辑
删除
增加
调整优先级
```

然后：

> 执行研究。

---

# 14. Research Task

Research Plan 被拆成具体 Task。

例如：

```text
Task 01
寻找脑机接口定义和分类

Task 02
寻找 EEG BCI 基础资料

Task 03
寻找侵入式 BCI 关键论文

Task 04
整理 Neuralink 发展史

Task 05
整理主要研究机构

Task 06
寻找 2024-2026 年重要进展
```

Task 是整个 Agent 系统的基本执行单元。

---

# 15. Task 状态

状态：

```text
Pending
Planning
Searching
Extracting
Validating
Writing
Completed
Failed
Paused
Needs Review
```

前端可视化：

```text
✓ Planning

✓ Search
  72 sources

✓ Filtering
  26 retained

→ Extracting

○ Validation

○ Writing
```

---

# 16. Agent 架构

建议第一版不要设计复杂 Multi-Agent。

采用：

# Orchestrator + Specialized Workers

```text
Research Orchestrator
        │
        ├── Search Worker
        ├── Source Evaluator
        ├── Extraction Worker
        ├── Entity Worker
        ├── Relation Worker
        ├── Validation Worker
        └── Writer Worker
```

---

# 17. Search Worker

负责：

- 查询生成

- 搜索结果获取

- URL 收集

- 去重

- 初筛

输入：

```text
Task
```

输出：

```json
{
  "sources": []
}
```

---

# 18. Source Evaluator

对来源进行评价。

维度：

```text
相关性
可信度
新鲜度
权威性
重复性
```

来源可以得到：

```text
relevance_score
quality_score
freshness_score
```

---

# 19. Source Type

支持：

```text
Web Page
Paper
PDF
Book
Dataset
GitHub
Official Documentation
Government
News
Company
Wiki
Video
```

V0.1 重点实现：

```text
Web
PDF
GitHub
Official
Academic metadata
```

---

# 20. Knowledge Extractor

把来源转换成结构化知识。

例如来源：

> 一篇论文

提取：

```text
核心结论
研究方法
实验结果
限制
关键概念
人物
机构
时间
数字
引用
```

---

# 21. Knowledge 类型

建议预设：

```text
Concept
Person
Organization
Company
Paper
Book
Experiment
Event
Technology
Product
Application
Policy
Dataset
Claim
Controversy
Location
```

---

# 22. Knowledge Node

每个知识点成为一个独立节点。

示例：

```yaml
id: concept-bell-inequality
type: Concept

title: Bell不等式

summary: ...

definition: ...

importance: ...

related:
  - quantum-entanglement
  - hidden-variable

sources:
  - source-001
  - source-023

confidence: 0.93

created_at:
updated_at:
```

---

# 23. Entity 与 Claim 必须分离

这是产品后期可信度非常重要的一点。

例如：

> Neuralink 在某实验中实现了某效果。

应该拆成：

```text
Entity:
Neuralink

Event:
某实验

Claim:
Neuralink 实现了 XX

Evidence:
Paper A
News B
Official C
```

而不是把整句话直接写进人物/企业节点。

---

# 24. Relation

关系类型：

```text
related_to
part_of
developed_by
founded_by
published_by
works_on
uses
depends_on
causes
before
after
contradicts
supports
similar_to
competes_with
located_in
```

例如：

```text
Bell Inequality
      ↓
related_to
      ↓
Quantum Entanglement
```

---

# 25. Evidence

所有重要知识必须有证据。

结构：

```yaml
claim:
  text:

evidence:
  source:
  location:
  quote:
  retrieved_at:

confidence:
```

原则：

> **没有来源的内容不能伪装成事实。**

---

# 26. 来源与引用

每个知识节点显示：

```text
Sources: 7
```

点击以后：

```text
来源名称
作者
日期
URL
来源类型
可信度
引用位置
```

支持：

> 从知识节点回溯到来源。

也支持：

> 从来源查看它贡献了哪些知识。

---

# 27. Markdown 作为核心存储格式

这是产品的重要战略。

不要把核心数据锁死在数据库里。

优先：

> Markdown + YAML Frontmatter

例如：

```markdown
---
type: concept
id: quantum-entanglement
title: Quantum Entanglement
sources:
  - source-001
  - source-002
confidence: 0.94
---

# Quantum Entanglement

## Summary

...

## Definition

...

## Related Concepts

- [[Bell Inequality]]
- [[EPR]]
- [[Quantum Information]]

## Sources

- [[Source - Bell 1964]]
```

---

# 28. Obsidian 兼容

系统生成标准 Obsidian Vault。

包括：

```text
.obsidian/
```

以及：

```text
index.md
concepts/
people/
papers/
organizations/
events/
technologies/
applications/
sources/
```

用户可以：

> Open in Obsidian

系统只负责生成和管理内容。

不会修改 Obsidian 核心程序。

---

# 29. 推荐目录结构

```text
Research/
│
├── README.md
├── Research Plan.md
├── Research Status.md
│
├── Concepts/
├── People/
├── Organizations/
├── Companies/
├── Technologies/
├── Papers/
├── Books/
├── Experiments/
├── Events/
├── Applications/
├── Policies/
├── Claims/
├── Controversies/
│
├── Sources/
│
└── Maps/
```

---

# 30. Index 页面

每个 Research Project 必须有一个入口：

# `README.md`

内容：

```text
# Quantum Computing

Research Purpose:
Personal Learning

Depth:
4

Dimensions:
Theory / History / Technology / Applications

Research Status:
78%

Last Updated:
2026-09-11
```

下面：

```text
## Research Map

## Key Concepts

## Key People

## Key Papers

## Major Events

## Applications

## Open Questions

## Latest Updates
```

---

# 31. Web UI

安装以后：

```text
localhost:xxxx
```

首页分成：

```text
Sidebar
Main Canvas
Inspector
```

---

# 32. 首页

首页显示：

### Research Projects

例如：

```text
Brain Computer Interface
78% complete

Quantum Computing
42% complete

AI Agent
91% complete
```

按钮：

> - New Research

---

# 33. 新建 Research 页面

核心表单：

```text
研究领域
[____________]

研究主题
[____________]

研究目的
[学习 ▼]

研究对象/受众
[____________]

研究深度
○1 ○2 ○3 ●4 ○5

研究维度
☑ 基础
☑ 技术
☑ 历史
☑ 应用
☑ 最新进展

时间范围
[2015] - [2026]

语言
☑ 中文
☑ English

来源
☑ 学术论文
☑ 官方网站
☑ GitHub
☑ 新闻
```

底部：

# 开始研究

---

# 34. Research Dashboard

研究过程中显示：

```text
Researching: Brain Computer Interface

Progress 67%

Tasks
✓ 基础定义
✓ 历史
✓ 分类
✓ 核心技术

→ Neural Signal
→ Major Companies

○ Applications
○ Future
```

---

# 35. Source Explorer

显示：

```text
All Sources 126

High Quality 42
Medium 63
Low 21
```

可筛选：

```text
类型
时间
可信度
相关性
语言
```

---

# 36. Knowledge Explorer

卡片形式：

```text
Neuralink

Company

Confidence 0.91

Related:
Brain Computer Interface
Implantable BCI
Elon Musk

Sources: 18
```

---

# 37. Knowledge Graph

使用：

```text
D3.js
```

或其他 Web Graph 技术。

提供：

### 2D Graph

```text
节点
关系
聚类
过滤
搜索
```

支持：

```text
按 Entity Type 过滤
按研究维度过滤
按时间过滤
按可信度过滤
```

---

# 38. Graph 交互

点击一个节点：

右侧 Inspector：

```text
Neuralink

Type:
Company

Summary:
...

Sources:
18

Related:
...

Timeline:
...
```

双击：

> 打开 Markdown。

---

# 39. Timeline

支持：

```text
2016
│
2019
│
2020
│
2022
│
2024
│
2026
```

例如：

```text
2016 — 公司成立
2019 — 重要论文
2023 — 产品事件
2025 — 新实验
2026 — 最新进展
```

---

# 40. Research Activity

系统要记录：

```text
今天新增：
12 sources
7 concepts
2 companies
5 papers
1 controversy
```

这可以增强用户对“Agent 正在工作”的感知。

---

# 41. 用户需要能够暂停

研究可能很长。

提供：

```text
Pause
Resume
Cancel
Retry
```

---

# 42. 用户需要能够调整任务

例如系统规划：

```text
“研究政策”
```

用户点击：

> 编辑

改成：

```text
“研究中国、美国、欧盟政策”
```

然后重新执行。

---

# 43. 用户需要能够追加研究

例如研究完成以后：

> 深入研究 Neuralink 最近三年进展。

系统在原项目上创建：

```text
Sub Research
```

而不是重新创建一个项目。

---

# 44. 增量研究

这是产品长期价值的重要能力。

已经研究过：

```text
100 sources
```

再次运行：

系统只寻找：

```text
新的
变化的
冲突的
用户指定的
```

而不是全部重新研究。

---

# 45. 更新机制

未来支持：

```text
每天
每周
每月
手动
```

V0.1 可先提供：

> 手动“更新研究”。

---

# 46. 研究结果不是静态报告

用户可以：

```text
重新研究
深入
扩展
验证
删除
合并
修改
```

知识库是动态的。

因此产品概念是：

# Living Knowledge Base

---

# 47. AI 模型层

必须做成 Provider abstraction。

例如：

```text
LLMProvider
```

支持：

```text
GLM
OpenAI
Claude
Gemini
DeepSeek
Ollama
```

---

# 48. 用户 API 配置

设置页：

```text
Provider:
GLM

API Key:
********

Base URL:
********

Model:
GLM-5
```

具体模型名称不要写死。

---

# 49. 为什么采用 Provider 架构

因为：

> 这个产品不是为了绑定 GLM。

你的 GLM 只是当前低成本 Worker。

未来可以：

```text
Planner → GPT
Search synthesis → Claude
Extraction → GLM
Embedding → Local
```

甚至：

```text
Cheap model
Heavy model
Local model
```

按照任务自动路由。

---

# 50. 成本控制

Research 很容易产生大量 token。

因此每个 Task 要记录：

```text
input tokens
output tokens
estimated cost
execution time
```

Dashboard：

```text
Today's Research

Tasks: 18
Tokens: 1.4M
Estimated Cost: ¥xx
```

---

# 51. Agent Memory

每一个 Research Project 拥有自己的上下文。

避免：

> 每个 Task 都重新告诉模型研究主题。

Context：

```text
Research Config
+
Research Plan
+
Existing Knowledge
+
Existing Sources
+
Existing Claims
```

---

# 52. 去重

必须避免：

同一来源：

```text
https://xxx.com
https://xxx.com/
https://www.xxx.com
```

被当成三份。

需要：

```text
URL normalization
title similarity
content hash
semantic similarity
```

---

# 53. 来源可信度

V0.1 不需要训练评分模型。

采用规则 + LLM。

例如：

```text
官方机构
★★★★★

学术论文
★★★★★

大学
★★★★★

权威媒体
★★★★

公司宣传
★★★

Wikipedia
★★★

普通 Blog
★★

论坛
★
```

注意：

**低评级不代表内容错误，只代表来源权威性相对低。**

---

# 54. 事实冲突

这是整个产品真正体现“研究能力”的功能之一。

例如：

来源 A：

> 2024 年市场规模为 100 亿。

来源 B：

> 2024 年市场规模为 130 亿。

系统不能直接选一个。

应该建立：

# Conflicting Claims

```text
Claim A
$10B

Source A
Confidence 0.81

Claim B
$13B

Source B
Confidence 0.73
```

然后标记：

> ⚠ Conflicting Evidence

---

# 55. 不确定性

知识节点需要有：

```text
Confirmed
High Confidence
Medium Confidence
Low Confidence
Conflicting
Unverified
```

这样比单纯告诉用户：

> AI 认为……

可靠很多。

---

# 56. Research Report

虽然 V0.1 核心是 Knowledge Base，但应该提供：

> Generate Report

将已有知识整理成文章。

例如：

```text
Executive Summary
Research Scope
Key Findings
Technical Overview
Timeline
Companies
Trends
Controversies
Open Questions
Sources
```

但报告属于：

> Knowledge 的视图。

不能反过来成为唯一数据。

---

# 57. Export

支持：

```text
Markdown
Obsidian Vault
JSON
CSV
```

未来：

```text
PDF
Word
PPT
HTML Website
```

---

# 58. 本地优先

第一版原则：

# Local First

用户自己的知识：

```text
本地硬盘
```

API：

```text
用户自己的 API Key
```

系统不要强制上传知识库到你的服务器。

---

# 59. 隐私原则

尤其因为以后可能处理：

- 企业资料

- 内部研究

- 商业计划

- 私密知识

必须：

> 用户明确配置哪个模型，就把什么数据发送给哪个模型。

在 UI 明确说明：

```text
Your data remains local unless you choose
an external AI provider.
```

---

# 60. 研究日志

系统应该记录：

```text
Research Log

10:21 Search query:
"brain computer interface 2026"

10:23 Found:
37 sources

10:25 Removed:
11 duplicated sources

10:28 Extracted:
8 concepts

10:31 Validation:
3 claims require review
```

用户可以查看。

这对于建立信任非常重要。

---

# 61. 可解释性

用户可以问：

> 这个结论从哪来的？

点击节点：

```text
Claim
↓
Evidence
↓
Source
↓
Original URL
```

最终形成：

# Source → Evidence → Claim → Knowledge

这是产品的重要护城河。

---

# 62. 错误处理

如果：

```text
搜索失败
API 错误
网页无法访问
PDF 无法读取
模型超时
```

Task 标记：

```text
Failed
```

并显示：

```text
Retry
Use another provider
Skip
Manual input
```

---

# 63. Research Quality Score

每个项目可以生成：

```text
Research Quality: 82
```

不是“真理评分”，而是研究完整度：

```text
Source Diversity
Coverage
Evidence Density
Freshness
Cross-validation
```

---

# 64. Coverage

例如：

```text
Dimensions

基础        100%
历史        100%
技术         93%
产业         80%
争议         42%
前沿         65%
```

非常直观。

---

# 65. “研究完成”不能简单等于 100%

系统应该显示：

```text
Coverage 86%

Core Research: Complete

Frontier:
Partial

Controversies:
Limited Evidence
```

防止用户误以为：

> AI 已经把这个世界研究完了。

---

# 66. Research Gaps

这是以后很有价值的功能。

系统分析已有知识后提示：

> 以下方向目前资料不足：

```text
中国政策研究 —— Low Coverage

2025-2026 实验数据 —— Low Coverage

商业化案例 —— Medium Coverage
```

用户点击：

> Fill Gap

系统建立新的 Research Task。

于是产生：

# Research Loop

```text
Research
↓
Knowledge
↓
Coverage Analysis
↓
Gap Detection
↓
New Task
↓
Research
```

这才开始真正像一个 Research OS。

---

# 67. UI 信息架构

建议：

```text
┌─────────────────────────────────────────────┐
│ Morpho Research OS                          │
├──────────────┬──────────────────────────────┤
│              │                              │
│ Projects     │        Main Workspace        │
│              │                              │
│ Research     │                              │
│ Sources      │                              │
│ Knowledge    │                              │
│ Graph        │                              │
│ Timeline     │                              │
│ Tasks        │                              │
│ Reports      │                              │
│              │                              │
│ Settings     │                              │
└──────────────┴──────────────────────────────┘
```

---

# 68. Project 页面

顶部：

```text
Brain Computer Interface

Progress 74%
Quality 82
Sources 126
Knowledge 348
Claims 97
```

标签：

```text
Overview
Tasks
Sources
Knowledge
Graph
Timeline
Gaps
Reports
```

---

# 69. 首页视觉风格

我建议不要做成：

> 企业管理后台。

而应该具有：

> **研究工作台 + 知识地图**

感觉更像：

```text
Obsidian
+
Linear
+
Deep Research
+
Knowledge Graph
```

视觉重点：

**信息密度高，但不混乱。**

---

# 70. V0.1 MVP 核心流程

整个 MVP 实际只需要打通这一条：

```text
Create Research
      ↓
Configure
      ↓
Generate Research Plan
      ↓
Approve
      ↓
Run Tasks
      ↓
Search Web
      ↓
Extract Knowledge
      ↓
Generate Markdown
      ↓
Build Relations
      ↓
Render Graph
```

只要这条链路能稳定跑起来，产品就成立。

---

# 71. V0.1 推荐技术架构

考虑你后面会让 Codex + GLM 大量开发，我建议：

### Frontend

```text
React
TypeScript
Vite
```

可视化：

```text
D3.js
```

UI：

```text
Tailwind
```

---

### Backend

如果你希望简单：

```text
Python
FastAPI
```

Research Worker：

```text
Python
```

因为：

- 爬取资料方便

- PDF 处理方便

- AI SDK 丰富

- 数据处理方便

---

### Database

第一版：

```text
SQLite
```

原因：

> 本地应用不应该一开始就搞 PostgreSQL。

---

### Task Queue

V0.1：

```text
SQLite + asyncio
```

以后：

```text
Redis
Celery
Temporal
```

均可。

第一版不要上。

---

# 72. 文件系统

核心：

```text
workspace/
```

下面：

```text
projects/
research_data/
vaults/
logs/
cache/
```

---

# 73. 知识库同步原则

SQLite 是：

> **运行状态 / 索引 / 任务状态**

Markdown 是：

> **用户知识资产**

不能反过来。

---

# 74. 一个重要的架构原则

必须让：

```text
AI
```

成为：

> **知识生产者**

而不是：

> **知识唯一存储者。**

用户随时可以删掉程序：

```text
留下 Markdown
```

依然拥有完整知识。

这会成为非常好的产品理念。

---

# 75. GitHub OSS 定位

建议采用：

> Open-source core.

核心开源：

```text
Research Planner
Research Engine
Knowledge Schema
Markdown Writer
Graph Renderer
Provider System
Task Engine
```

---

# 76. 商业扩展方向

以后可以有：

```text
Cloud Research
Scheduled Research
Team Workspace
Private Enterprise Deployment
Enterprise Connectors
Advanced Search
Managed AI
```

但现在不要开发。

---

# 77. 与 GLM 的结合

你的闲置 GLM 算力非常适合：

### Worker：

```text
Search query generation
Page extraction
Entity extraction
Classification
Summarization
Markdown generation
Deduplication
Tagging
```

比较贵的模型：

```text
Research planning
Conflict analysis
Final synthesis
```

因此未来可以：

# Model Router

自动选择模型。

---

# 78. Codex 与 GLM 的分工

非常适合你的工作模式。

### Codex

负责：

```text
架构
核心逻辑
关键重构
Code Review
复杂 Bug
安全
```

### GLM

负责：

```text
大量 CRUD
UI 页面
数据模型
工具函数
Adapter
测试
文档
小功能
```

你负责：

```text
产品方向
验收
体验
研究流程
```

---

# 79. MVP 开发阶段

建议不要一次开发全部。

## Phase 1

### “Research → Markdown”

做到：

```text
创建研究
↓
规划
↓
搜索
↓
提取
↓
Markdown
```

---

## Phase 2

### “Knowledge Graph”

增加：

```text
Entity
Relation
Graph
Timeline
```

---

## Phase 3

### “Research Agent”

增加：

```text
Validation
Conflicts
Gap detection
Incremental research
```

---

## Phase 4

### “Living Research”

增加：

```text
Scheduled update
Change detection
Research alerts
```

---

# 80. V0.1 成功标准

不是：

> 页面做得多漂亮。

而是：

一个第一次使用的用户能够在：

**5 分钟以内**

完成：

```text
创建研究项目
↓
输入研究参数
↓
启动
```

然后：

**30 分钟～数小时后**：

获得：

```text
一个结构完整的 Markdown Vault
+
来源
+
引用
+
知识节点
+
基本关系图
```

---

# 81. 产品的核心北极星指标

我建议定义：

# Research Knowledge Yield

即：

> 每个研究任务最终产生多少有来源、可复用、可链接的有效知识。

而不是单纯：

```text
搜索了多少网页
用了多少 Token
生成了多少字
```

---

# 82. 用户真正获得的东西

不是：

> 一篇报告。

而是：

```text
Research Project
       │
       ├── Sources
       │
       ├── Knowledge
       │
       ├── Claims
       │
       ├── Entities
       │
       ├── Relations
       │
       ├── Timeline
       │
       └── Reports
```

之后任何一个新问题：

> 都可以在这个知识空间上继续研究。

---

# 83. 最重要的产品差异化

我会把产品的差异化总结成五句话：

### 1

**Research is a process, not a prompt.**

研究是一个持续过程，而不是一次 Prompt。

### 2

**Knowledge is structured, not just generated.**

知识必须结构化。

### 3

**Every important claim should be traceable.**

重要结论必须能够回溯来源。

### 4

**The knowledge belongs to the user.**

知识资产归用户。

### 5

**A research project should keep growing.**

研究结束后，知识库仍然可以继续成长。

---

# 84. 第一版最应该砍掉的东西

为了确保 GLM 能快速完成，我建议 V0.1 暂时不要做：

```text
3D Knowledge Graph
复杂 Agent 自主决策
多人协作
账号体系
云同步
Vector DB
复杂权限
复杂 RAG
移动端
浏览器插件
收费体系
```

2D Graph 已经够。

---

# 85. 第一版真正的 Demo

我认为我们应该拿这个作为第一个 Demo：

## 研究主题

> **“脑机接口”**

用户输入：

```text
领域：
神经科学 / 人工智能

用途：
大学课程

深度：
4

维度：
基础
历史
技术
实验
企业
应用
最新进展
争议

时间：
2015–2026

语言：
中文 + 英文
```

点击：

> 开始研究

最终出现：

```text
Brain Computer Interface
│
├── Neuroscience
├── EEG
├── Neural Signal
├── Invasive BCI
├── Non-invasive BCI
├── Neuralink
├── Synchron
├── BrainGate
├── Applications
├── Clinical Trials
├── Regulation
└── Future
```

同时：

```text
126 Sources
348 Knowledge Nodes
97 Claims
215 Relations
```

再点击：

> Open in Obsidian

瞬间出现一个完整 Vault。

**这就是我们第一版最应该追求的“啊，原来可以这样”的瞬间。**

---

# 86. 我对这个项目最终形态的判断

我现在反而不建议把它简单叫做：

> Obsidian AI 插件。

因为那会把你的思维限制住。

应该把它理解成：

# **AI Research OS**

Obsidian 只是它的一个重要出口。

未来完全可以：

```text
Research OS
│
├── Obsidian
├── Web
├── PDF
├── Word
├── PPT
├── Knowledge Graph
├── API
└── Agent
```

甚至最终：

```text
研究问题
 ↓
Research OS
 ↓
Knowledge Base
 ↓
课程
报告
PPT
文章
视频
产品决策
```

这就和你自己的能力体系非常契合——**研究 → 知识结构化 → 内容生产 → ToB 方案**。

---

# 87. 一个我认为特别值得保留的未来概念

以后首页不要只是：

> “你的研究项目”

而是：

# **Research Universe**

每一个研究项目都是一个宇宙。

```text
             Concepts
                ●
               / \
              /   \
        Papers ●---● People
             /       \
            ●---------●
        Technology   Company
```

用户进入一个研究项目以后，是在**探索一个不断增长的知识空间**。

这也让你的产品从普通的：

> AI Research Assistant

在产品体验上向：

> **Personal Research Environment**

迈了一步。

---

# 88. PRD 一句话版本

最后把整个产品压缩成一句，可以作为项目 README 的产品定义：

> **Morpho Research OS is an open-source, local-first AI research environment that turns research questions into continuously evolving, source-grounded knowledge bases.**

中文：

> **Morpho Research OS 是一个开源、本地优先的 AI 研究环境，把一个研究问题自动转化为有来源、可关联、可持续演进的个人知识库。**

---


