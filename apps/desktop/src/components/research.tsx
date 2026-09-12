import { Label, Select } from "@morpho/ui";
import type { ResearchConfig } from "@/types/domain";
import { RESEARCH_PURPOSES } from "@/types/domain";
import { PURPOSE_LABELS } from "@/types/labels";

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
