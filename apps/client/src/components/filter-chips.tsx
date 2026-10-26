import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { XIcon } from "lucide-react";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
}

export const FilterChips = ({ chips, onClearAll }: FilterChipsProps) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge className="gap-1 pr-1" key={chip.key} variant="secondary">
          {chip.label}
          <Tip
            label={`Remove filter: ${chip.label}`}
            render={
              <Button
                aria-label={`Remove filter: ${chip.label}`}
                onClick={chip.onRemove}
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <XIcon />
          </Tip>
        </Badge>
      ))}
      <Tip
        label="Remove every filter"
        render={
          <Button
            onClick={onClearAll}
            size="xs"
            type="button"
            variant="ghost"
          />
        }
      >
        Clear all
      </Tip>
    </div>
  );
};
