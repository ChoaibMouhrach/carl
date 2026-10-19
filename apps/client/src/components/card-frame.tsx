import { cn } from "@repo/ui/utils";

interface CardFrameProps {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}

// Outlines the card on hover without restyling the shadcn Card inside it
export const CardFrame = ({ children, onClick, selected }: CardFrameProps) => (
  <div
    className={cn(
      "flex flex-col rounded-xl transition-shadow hover:ring-2 hover:ring-primary/30 *:flex-1",
      onClick && "cursor-pointer",
      selected && "ring-2 ring-primary",
    )}
    onClick={onClick}
  >
    {children}
  </div>
);
