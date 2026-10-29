import { createContext, useContext } from "react";

export interface EntitySheetApi {
  openCommunity: (communityId: number) => void;
  openLead: (leadId: number) => void;
}

export const EntitySheetContext = createContext<EntitySheetApi | null>(null);

export const useEntitySheet = () => {
  const api = useContext(EntitySheetContext);
  if (!api) throw new Error("useEntitySheet needs an EntitySheetProvider");
  return api;
};
