import { Button } from "@repo/ui/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CopyButtonProps {
  value: string;
}

export const CopyButton = ({ value }: CopyButtonProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error(t("settings.agents.copyFailed"));
      return;
    }

    setCopied(true);
    toast.success(t("settings.agents.copied"));
    setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <Button onClick={copy} type="button" variant="outline">
      {copied ? <CheckIcon /> : <CopyIcon />}
      {t("settings.agents.copy")}
    </Button>
  );
};
