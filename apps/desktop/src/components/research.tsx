import { Label, Select } from "@morpho/ui";
import { useTranslation } from "react-i18next";
import type { ResearchConfig } from "@/types/domain";
import { RESEARCH_PURPOSES } from "@/types/domain";

/* ------------------------------------------------------------------ */
/* Purpose selector                                                    */
/* ------------------------------------------------------------------ */

/** Purpose options from docs/PRD.md §5, kept canonical in data. The label
 * and option names go through t() (ADR-023, "config" namespace; the purpose
 * vocabulary itself lives in common:vocab.purpose). */
export function PurposeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ResearchConfig["purpose"];
  onChange: (purpose: ResearchConfig["purpose"]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("config");
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor="research-purpose">{t("field.purpose")}</Label>
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
            {t(`common:vocab.purpose.${purpose}`, { defaultValue: purpose })}
          </option>
        ))}
      </Select>
    </div>
  );
}
