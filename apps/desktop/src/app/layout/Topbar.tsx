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
      className="flex h-[65px] shrink-0 items-center justify-between border-b border-border px-xl"
      data-testid="topbar"
    >
      <nav aria-label="位置" className="flex items-center gap-sm text-caption text-text-muted">
        <span>Morpho</span>
        <span aria-hidden="true">/</span>
        <strong className="font-semibold text-text-primary">
          {active?.name ?? "未选择项目"}
        </strong>
      </nav>
      <div className="flex items-center gap-lg">
        <span className="flex items-center gap-sm text-caption text-text-muted">
          <span aria-hidden="true" className="inline-block size-[7px] rounded-full bg-success" />
          已保存
        </span>
        <button
          type="button"
          title="帮助"
          aria-label="帮助"
          className="flex size-7 items-center justify-center rounded-full border border-border text-caption text-text-muted"
        >
          ?
        </button>
        <button
          type="button"
          title="本地用户"
          aria-label="本地用户"
          className="flex size-7 items-center justify-center rounded-full bg-[#b8c8ef] text-[11px] font-extrabold text-[#151a24]"
        >
          A
        </button>
      </div>
    </header>
  );
}
