import { Button, Card } from "@morpho/ui";
import { PageShell } from "@/components/PageShell";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * 本地工作区设置(spec §6.8)。V0.1 只做状态展示与导航:
 * 无表单、无持久化;知识库位置等桌面能力由后续 Tauri 接入。
 */
export function SettingsPage() {
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);

  const cards = [
    {
      icon: "⌂",
      title: "知识库位置",
      description: "用于保存 SQLite 索引、缓存和 Obsidian Vault。",
      value: "尚未连接",
      action: (
        <Button size="sm" variant="ghost" disabled title="桌面版提供">
          选择文件夹 →
        </Button>
      ),
    },
    {
      icon: "✦",
      title: "AI Provider",
      description: "配置 OpenAI-compatible API 或本地 Ollama。",
      value: "未配置",
      action: (
        <Button size="sm" variant="ghost" onClick={() => setActiveView("config")}>
          配置 Provider →
        </Button>
      ),
    },
    {
      icon: "▤",
      title: "私有对话日志",
      description: "日志默认只在本机保存，不参与研究任务。",
      value: "已启用",
      action: (
        <Button size="sm" variant="ghost" onClick={() => setActiveView("journal")}>
          打开日志 →
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      kicker="设置"
      title="本地工作区设置"
      description="保持最少配置，只设置研究真正需要的内容。"
    >
      <div className="grid max-w-[850px] gap-md" data-testid="settings-grid">
        {cards.map((card) => (
          <Card key={card.title} className="grid grid-cols-[36px_1fr_auto] items-start gap-md p-lg">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-info"
            >
              {card.icon}
            </span>
            <div>
              <h2 className="text-h3 text-text-primary">{card.title}</h2>
              <p className="mb-sm text-caption text-text-secondary">{card.description}</p>
              {card.action}
            </div>
            <span className="pt-xs text-caption text-text-muted">{card.value}</span>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
