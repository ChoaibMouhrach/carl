import { api } from "@/api";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { formatDate } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

type Lead = Awaited<ReturnType<typeof api.lead.show>>["lead"];

interface LeadHeaderProps {
  isRemovePending: boolean;
  lead: Lead;
  onRemove: () => void;
}

export const LeadHeader = ({
  isRemovePending,
  lead,
  onRemove,
}: LeadHeaderProps) => {
  const { t } = useTranslation();

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <AdminPageTitle>{lead.name}</AdminPageTitle>
        <AdminPageDescription>
          @{lead.skoolUsername} · {formatDate(lead.createdAt)}
        </AdminPageDescription>
      </div>
      <div className="flex gap-2">
        <Button
          render={
            <Link
              params={{ leadId: lead.leadId }}
              to="/admin/leads/$leadId/edit"
            />
          }
          variant="outline"
        >
          <PencilIcon />
          {t("adminLeads.edit")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button disabled={isRemovePending} variant="outline" />}
          >
            {isRemovePending ? <Spinner /> : <Trash2Icon />}
            {t("adminLeads.delete")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("adminLeads.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("adminLeads.deleteDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("adminLeads.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove} variant="destructive">
                {t("adminLeads.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
};
