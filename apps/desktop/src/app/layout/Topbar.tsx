import { Badge, Button } from "@morpho/ui";
import { CircleHelp } from "lucide-react";
import { useProjects } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * 原型顶栏(spec §4.4):面包屑 Morpho / 项目名;右侧已保存状态、帮助与本地头像。
 */
export function Topbar() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const { data: projects } = useProjects();
  const active = projects?.find((p) => p.id === activeProjectId);

  return (
    <header
      className="flex h-topbar shrink-0 items-center justify-between border-b border-border px-xl"
      data-testid="topbar"
    >
      <nav aria-label="位置" className="flex items-center gap-sm text-caption text-text-muted">
        <img
          src="/brand-mark.png"
          alt=""
          className="size-[18px] rounded-sm border border-border object-cover"
        />
        <span>Morpho</span>
        <span aria-hidden="true">/</span>
        <strong className="font-semibold text-text-primary">
          {active?.name ?? "未选择项目"}
        </strong>
      </nav>
      <div className="flex items-center gap-lg">
        {/* Prototype status dot promoted to the registered Badge primitive;
            the label gains the shared pill face (bg-success/10 + border). */}
        <Badge variant="success" dot>
          已保存
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          disabled
          title="本地版暂未提供帮助文档"
          aria-label="帮助"
          className="rounded-full! border-border! text-caption"
        >
          <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="本地用户"
          aria-label="本地用户"
          className="rounded-full! bg-avatar-bg! text-avatar-ink! text-micro font-extrabold"
        >
          A
        </Button>
      </div>
    </header>
  );
}
