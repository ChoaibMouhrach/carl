import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

interface TipProps {
  /** One short line saying what the control does, or why it is disabled */
  label: string;
  /** The control to attach the tooltip to, e.g. `<Button />` */
  render: React.ReactElement;
  children?: React.ReactNode;
}

export const Tip = ({ label, render, children }: TipProps) => (
  <Tooltip>
    <TooltipTrigger render={render}>{children}</TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);
