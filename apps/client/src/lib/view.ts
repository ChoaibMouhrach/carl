import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { useCallback, useSyncExternalStore } from "react";

export const views = ["table", "cards"] as const;

export type View = (typeof views)[number];

const STORAGE_KEY = "list-view";
const CHANGE_EVENT = "list-view-change";

const readView = (): View => {
  try {
    return (
      views.find((view) => view === localStorage.getItem(STORAGE_KEY)) ??
      "table"
    );
  } catch {
    return "table";
  }
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

// Tables don't fit a phone, so small screens always get cards
export const useView = () => {
  const isMobile = useIsMobile();
  const stored = useSyncExternalStore<View>(subscribe, readView, () => "table");

  const setView = useCallback((next: View) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const view: View = isMobile ? "cards" : stored;

  return { view, setView };
};
