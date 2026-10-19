import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { Button } from "@repo/ui/components/ui/button";

interface SelectionBarProps {
  selection: Selection;
  /** Cards have no header row, so the bar carries the select-all checkbox */
  showSelectAll?: boolean;
  disabled?: boolean;
}

export const SelectionBar = ({
  selection,
  showSelectAll,
  disabled,
}: SelectionBarProps) => {
  if (!showSelectAll && selection.count === 0) return null;

  return (
    <div className="flex min-h-9 items-center gap-3 text-sm">
      {showSelectAll && (
        <SelectCheckbox
          checked={selection.allSelected}
          disabled={disabled}
          indeterminate={selection.someSelected}
          label="Select all"
          onChange={selection.toggleAll}
        />
      )}
      <span className="text-muted-foreground">
        {selection.count > 0 ? `${selection.count} selected` : "Select all"}
      </span>
      {selection.count > 0 && (
        <Button onClick={selection.clear} size="sm" variant="ghost">
          Clear selection
        </Button>
      )}
    </div>
  );
};
