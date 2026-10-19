import { Button } from "@repo/ui/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyButtonProps {
  value: string;
}

export const CopyButton = ({ value }: CopyButtonProps) => {
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
    <Button onClick={copy} type="button" variant="outline">
      {copied ? <CheckIcon /> : <CopyIcon />}
      Copy
    </Button>
  );
};
