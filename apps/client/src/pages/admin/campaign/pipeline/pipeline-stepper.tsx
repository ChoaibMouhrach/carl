import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/ui/item";
import type { PipelineStepId, StepStatus } from "./pipeline-step";

interface PipelineStepperProps {
  scrapeStatus: StepStatus;
  tavilyStatus: StepStatus;
  scrapeCount: number | null;
  tavilyCount: number | null;
  isScrapeDone: boolean;
  selected: PipelineStepId;
  onSelect: (step: PipelineStepId) => void;
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface StepBadge {
  label: string;
  variant: BadgeVariant;
}

const statusBadge: Record<StepStatus, StepBadge> = {
  idle: { label: "Ready", variant: "secondary" },
  running: { label: "Running", variant: "default" },
  done: { label: "Done", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

const soonBadge: StepBadge = { label: "Soon", variant: "outline" };

export const PipelineStepper = ({
  scrapeStatus,
  tavilyStatus,
  scrapeCount,
  tavilyCount,
  isScrapeDone,
  selected,
  onSelect,
}: PipelineStepperProps) => {
  const steps: {
    id: PipelineStepId;
    title: string;
    description: string;
    badge: StepBadge;
  }[] = [
    {
      id: "scrape",
      title: "Scrape",
      description:
        scrapeCount === null ? "Find leads on Skool" : `${scrapeCount} leads`,
      badge: statusBadge[scrapeStatus],
    },
    {
      id: "tavily",
      title: "Tavily",
      description:
        tavilyCount === null
          ? "Find owner contact details"
          : `${tavilyCount} contactable`,
      badge: isScrapeDone
        ? statusBadge[tavilyStatus]
        : { label: "Waiting", variant: "outline" },
    },
    {
      id: "ai-filter",
      title: "AI filter",
      description: "Classify each lead",
      badge: soonBadge,
    },
    {
      id: "accepted",
      title: "Accepted",
      description: "Review the best fits",
      badge: soonBadge,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <Tip
          key={step.id}
          label={`Show the ${step.title} step`}
          render={
            <Item
              onClick={() => onSelect(step.id)}
              render={<button type="button" />}
              variant={selected === step.id ? "muted" : "outline"}
            />
          }
        >
          <ItemMedia variant="icon">
            <Badge variant={selected === step.id ? "default" : "outline"}>
              {index + 1}
            </Badge>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{step.title}</ItemTitle>
            <ItemDescription>{step.description}</ItemDescription>
          </ItemContent>
          <Badge variant={step.badge.variant}>{step.badge.label}</Badge>
        </Tip>
      ))}
    </div>
  );
};
