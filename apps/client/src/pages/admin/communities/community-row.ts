import type { PriceInterval } from "@/lib/pricing";
import type { Selection } from "@/lib/use-selection";

// What the list and the lead page both return for a community
export interface CommunityRow {
  communityId: number;
  leadId: number;
  name: string;
  skoolUrl: string;
  description: string | null;
  members: number | null;
  mrr: number | null;
  email: string | null;
  thumbnailUrl: string | null;
  logoUrl: string | null;
  isFree: boolean;
  priceCents: number | null;
  priceCurrency: string | null;
  priceInterval: PriceInterval | null;
  createdAt: string;
  lead?: { leadId: number; name: string; username: string };
}

export interface CommunityListProps {
  communities: CommunityRow[];
  isMutating: boolean;
  onRemove: (communityId: number) => void;
  removingCommunityId?: number;
  selection: Selection;
  showLead: boolean;
}
