import { views, type View } from "@/lib/view";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components/ui/toggle-group";
import { LayoutGridIcon, Rows3Icon } from "lucide-react";

interface ViewSwitchProps {
  onChange: (view: View) => void;
  view: View;
}

export const ViewSwitch = ({ onChange, view }: ViewSwitchProps) => {
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <ToggleGroup
      aria-label="View"
      onValueChange={(next) => {
        const selected = views.find((item) => item === next.at(0));
        if (selected) onChange(selected);
      }}
      spacing={0}
      value={[view]}
      variant="outline"
    >
      <ToggleGroupItem aria-label="Table view" value="table">
        <Rows3Icon />
      </ToggleGroupItem>
      <ToggleGroupItem aria-label="Card view" value="cards">
        <LayoutGridIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
