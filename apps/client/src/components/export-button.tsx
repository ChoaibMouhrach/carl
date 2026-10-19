import { onError } from "@/lib/base-api";
import { csvFilename, saveBlob } from "@/lib/download";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface ExportButtonProps {
  /** The file name without the date and extension */
  filename: string;
  onExport: () => Promise<Blob>;
}

export const ExportButton = ({ filename, onExport }: ExportButtonProps) => {
  const { t } = useTranslation();

  const exporting = useMutation({
    mutationFn: async () => {
      const blob = await onExport();
      saveBlob(blob, csvFilename(filename));
    },
    onError,
    onSuccess: () => toast.success(t("export.done")),
  });

  return (
    <Button
      disabled={exporting.isPending}
      onClick={() => exporting.mutate()}
      variant="outline"
    >
      {exporting.isPending ? <Spinner /> : <DownloadIcon />}
      {t("export.button")}
    </Button>
  );
};
