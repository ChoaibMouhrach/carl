import { Tip } from "@/components/tip";
import type { LeadStage } from "@repo/constants/pipeline";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/ui/item";

interface FunnelTile {
  stage: LeadStage | undefined;
  title: string;
  description: string;
  count: number;
}

interface FunnelProps {
  funnel: {
    scraped: number;
    researched: number;
    contactable: number;
    withEmail: number;
    needsEmail: number;
  };
  selected: LeadStage | undefined;
  onSelect: (stage: LeadStage | undefined) => void;
}

export const Funnel = ({ funnel, selected, onSelect }: FunnelProps) => {
  const tiles: FunnelTile[] = [
    {
      stage: undefined,
      title: "Scraped",
      description: "Every lead in the campaign",
      count: funnel.scraped,
    },
    {
      stage: "researched",
      title: "Researched",
      description: "Tavily has looked them up",
      count: funnel.researched,
    },
    {
      stage: "contactable",
      title: "Contactable",
      description: "Has a website or LinkedIn",
      count: funnel.contactable,
    },
    {
      stage: "withEmail",
      title: "Has email",
      description: "From any source",
      count: funnel.withEmail,
    },
    {
      stage: "needsEmail",
      title: "Needs email",
      description: "Contactable, no email yet",
      count: funnel.needsEmail,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Tip
          key={tile.title}
          label={`Show ${tile.title.toLowerCase()} leads below`}
          render={
            <Item
              onClick={() => onSelect(tile.stage)}
              render={<button type="button" />}
              variant={selected === tile.stage ? "muted" : "outline"}
            />
          }
        >
          <ItemContent>
            <ItemTitle>{tile.count}</ItemTitle>
            <ItemDescription>{tile.title}</ItemDescription>
            <ItemDescription>{tile.description}</ItemDescription>
          </ItemContent>
        </Tip>
      ))}
    </div>
  );
};
