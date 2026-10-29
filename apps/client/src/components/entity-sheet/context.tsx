import { useState } from "react";
import { CommunitySheet } from "./community-sheet";
import { LeadSheet } from "./lead-sheet";
import { EntitySheetContext, type EntitySheetApi } from "./use-entity-sheet";

type Target = { kind: "lead" | "community"; id: number };

export const EntitySheetProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [target, setTarget] = useState<Target | null>(null);
  const close = () => setTarget(null);

  const api: EntitySheetApi = {
    openCommunity: (id) => setTarget({ kind: "community", id }),
    openLead: (id) => setTarget({ kind: "lead", id }),
  };

  return (
    <EntitySheetContext.Provider value={api}>
      {children}
      <LeadSheet
        leadId={target?.kind === "lead" ? target.id : undefined}
        onClose={close}
      />
      <CommunitySheet
        communityId={target?.kind === "community" ? target.id : undefined}
        onClose={close}
      />
    </EntitySheetContext.Provider>
  );
};
