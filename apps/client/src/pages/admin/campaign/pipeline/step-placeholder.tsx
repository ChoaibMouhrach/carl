import { Tip } from "@/components/tip";
import { Button } from "@repo/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import type { ReactNode } from "react";

interface StepPlaceholderProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; tip: string; onClick: () => void };
}

export const StepPlaceholder = ({
  icon,
  title,
  description,
  action,
}: StepPlaceholderProps) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">{icon}</EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {action && (
      <EmptyContent>
        <Tip
          label={action.tip}
          render={<Button onClick={action.onClick} variant="outline" />}
        >
          {action.label}
        </Tip>
      </EmptyContent>
    )}
  </Empty>
);
