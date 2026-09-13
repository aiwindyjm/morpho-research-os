# Page Specification: 报告与设置（Reports / Settings）

Page: 设置（Settings，真实页）／报告（Reports，占位）
Purpose: 设置为本地工作区的状态展示页：三张状态卡说明能力现状并提供导航，V0.1 无表单、无持久化。报告仍为诚实占位：保留为合法 ViewId（PRD §13 注册表不破坏）但不出现在侧栏导航（ADR-013）。
Pattern: Settings（状态卡列表）/ Placeholder
Layout: PageShell（「本地工作区设置」+ lede「保持最少配置，只设置研究真正需要的内容。」）+ 纵向三卡列表（max-width 850px）；报告为 PageShell + Alert
Navigation: 侧边栏底部「设置」；报告不进导航（ADR-013）
Sections: ① 知识库位置（⌂，「尚未连接」；「选择文件夹 →」V0.1 禁用，title「桌面版提供」）② AI Provider（✦，「未配置」；「配置 Provider →」→ 研究配置）③ 私有对话日志（▤，「已启用」；「打开日志 →」→ 对话日志）
Components: Card, Button, PageShell；报告：Alert, PageShell
States: 静态状态展示；知识库位置按钮禁用
Interactions: 仅页面导航（config / journal）；无表单提交、无数据写入
Empty State: 不适用
Loading State: 不适用
Error State: 不适用
Responsive: 单列流式（<768 卡内布局收窄）；报告维度覆盖表在窄窗口下于 overflow-x-auto 区域内横向滚动（min-w-[480px] 下限）
Analytics/Events: 无
