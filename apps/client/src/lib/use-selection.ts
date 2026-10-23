import { useState } from "react";

// A selection only lasts while the same rows are on screen: paging or filtering clears it
export const useSelection = (ids: number[]) => {
  const key = ids.join(",");
  const [state, setState] = useState({ key, selected: new Set<number>() });

  const selected = state.key === key ? state.selected : new Set<number>();

  if (state.key !== key) {
    setState({ key, selected });
  }

  const update = (next: Set<number>) => setState({ key, selected: next });

  const allSelected = ids.length > 0 && selected.size === ids.length;

  return {
    count: selected.size,
    ids: [...selected],
    allSelected,
    someSelected: selected.size > 0 && !allSelected,
    isSelected: (id: number) => selected.has(id),
    toggle: (id: number) => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      update(next);
    },
    toggleAll: () => update(allSelected ? new Set() : new Set(ids)),
    clear: () => update(new Set()),
  };
};

export type Selection = ReturnType<typeof useSelection>;
