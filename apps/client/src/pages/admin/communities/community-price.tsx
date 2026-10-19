import { formatCurrency } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import { useTranslation } from "react-i18next";

const intervalKeys = {
  month: "adminCommunities.perMonth",
  year: "adminCommunities.perYear",
  one_time: "adminCommunities.oneTime",
} as const;

interface CommunityPriceProps {
  community: {
    pricingType: "free" | "paid";
    priceAmount: number;
    priceCurrency: string | null;
    pricingInterval: keyof typeof intervalKeys | null;
  };
}

export const CommunityPrice = ({ community }: CommunityPriceProps) => {
  const { t } = useTranslation();

  if (community.pricingType === "free") {
    return <Badge variant="secondary">{t("adminCommunities.free")}</Badge>;
  }

  return (
    <>
      {formatCurrency(
        community.priceAmount / 100,
        community.priceCurrency ?? "USD",
      )}{" "}
      {community.pricingInterval && t(intervalKeys[community.pricingInterval])}
    </>
  );
};
