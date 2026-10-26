import { SelectCheckbox } from "@/components/select-checkbox";
import { Tip } from "@/components/tip";
import type { Selection } from "@/lib/use-selection";
import { Button } from "@repo/ui/components/ui/button";
import type { ReactNode } from "react";

interface SelectionBarProps {
  /** Buttons that act on the selected rows */
  actions?: ReactNode;
  selection: Selection;
  /** Cards have no header row, so the bar carries the select-all checkbox */
  showSelectAll?: boolean;
  disabled?: boolean;
}

export const SelectionBar = ({
  actions,
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
        <Tip
          label="Deselect everything"
          render={
            <Button onClick={selection.clear} size="sm" variant="ghost" />
          }
        >
          Clear selection
        </Tip>
      )}
      {selection.count > 0 && actions}
    </div>
  );
};
