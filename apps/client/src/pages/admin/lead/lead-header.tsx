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
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
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
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button disabled={isRemovePending} variant="outline" />}
          >
            {isRemovePending ? <Spinner /> : <Trash2Icon />}
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the lead and all of their communities.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove} variant="destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
};
