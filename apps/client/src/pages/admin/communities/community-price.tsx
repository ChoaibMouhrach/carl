import { formatPrice, type PricedCommunity } from "@/lib/pricing";
import { Badge } from "@repo/ui/components/ui/badge";

interface CommunityPriceProps {
  community: PricedCommunity;
}

export const CommunityPrice = ({ community }: CommunityPriceProps) => {
  if (community.isFree) {
    return <Badge variant="secondary">Free</Badge>;
  }

  return <span>{formatPrice(community)}</span>;
};
