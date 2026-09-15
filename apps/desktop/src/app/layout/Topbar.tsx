import { Badge, Button } from "@morpho/ui";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjects } from "@/services/queries";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * 原型顶栏(spec §4.4):面包屑 Morpho / 项目名;右侧已保存状态、帮助与本地头像。
 * All user-visible strings go through t() (ADR-023, "shell" namespace) — the
 * reference extraction pattern for feature views (I2).
 */
export function Topbar() {
  const { t } = useTranslation("shell");
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const { data: projects } = useProjects();
  const active = projects?.find((p) => p.id === activeProjectId);

  return (
    <header
      className="flex h-topbar shrink-0 items-center justify-between border-b border-border px-xl"
      data-testid="topbar"
    >
      <nav
        aria-label={t("breadcrumb")}
        className="flex items-center gap-sm text-caption text-text-muted"
      >
        <img
          src="/brand-mark.png"
          alt=""
          className="size-[18px] rounded-sm border border-border object-cover"
        />
        <span>Morpho</span>
        <span aria-hidden="true">/</span>
        <strong className="font-semibold text-text-primary">
          {active?.name ?? t("noProjectSelected")}
        </strong>
      </nav>
      <div className="flex items-center gap-lg">
        {/* Prototype status dot promoted to the registered Badge primitive;
            the label gains the shared pill face (bg-success/10 + border). */}
        <Badge variant="success" dot>
          {t("saved")}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          disabled
          title={t("helpUnavailable")}
          aria-label={t("help")}
          className="rounded-full! border-border! text-caption"
        >
          <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title={t("localUser")}
          aria-label={t("localUser")}
          className="rounded-full! bg-avatar-bg! text-avatar-ink! text-micro font-extrabold"
        >
          A
        </Button>
      </div>
    </header>
  );
}
