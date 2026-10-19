import { views, type View } from "@/lib/view";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components/ui/toggle-group";
import { LayoutGridIcon, Rows3Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ViewSwitchProps {
  onChange: (view: View) => void;
  view: View;
}

export const ViewSwitch = ({ onChange, view }: ViewSwitchProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <ToggleGroup
      aria-label={t("view.label")}
      onValueChange={(next) => {
        const selected = views.find((item) => item === next.at(0));
        if (selected) onChange(selected);
      }}
      spacing={0}
      value={[view]}
      variant="outline"
    >
      <ToggleGroupItem aria-label={t("view.table")} value="table">
        <Rows3Icon />
      </ToggleGroupItem>
      <ToggleGroupItem aria-label={t("view.cards")} value="cards">
        <LayoutGridIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
