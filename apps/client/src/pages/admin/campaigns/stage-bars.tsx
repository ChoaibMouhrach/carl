import type { StageCount } from "@/api/campaign";
import { useTranslation } from "react-i18next";

interface StageBarsProps {
  stages: StageCount[];
}

export const StageBars = ({ stages }: StageBarsProps) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...stages.map((stage) => stage.total));

  return (
    <div
      aria-label={t("adminCampaigns.pipelineSummary")}
      className="flex h-8 items-end gap-1"
      role="img"
    >
      {stages.map((stage) => (
        <div
          className={`w-2.5 rounded-sm ${stage.total === 0 ? "bg-muted" : "bg-primary"}`}
          key={stage.stage}
          style={{ height: `${Math.max(12, (stage.total / max) * 100)}%` }}
          title={t("adminCampaigns.stageBar", {
            number: stage.stage,
            count: stage.total,
          })}
        />
      ))}
    </div>
  );
};
