import { Button } from "@repo/ui/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyButtonProps {
  value: string;
  size?: "default" | "sm";
  /** Icon only, for tight spots; the label stays available to screen readers */
  label?: string;
}

export const CopyButton = ({
  value,
  size = "default",
  label,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Could not copy. Select the text and copy it.");
      return;
    }

    setCopied(true);
    toast.success("Copied.");
    setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <Button
      aria-label={label}
      onClick={copy}
      size={label ? "icon-sm" : size}
      type="button"
      variant="outline"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {!label && "Copy"}
    </Button>
  );
};
