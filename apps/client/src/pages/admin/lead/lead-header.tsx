import { api } from "@/api";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { PictureAvatar } from "@/components/picture-avatar";
import { Tip } from "@/components/tip";
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
import { ExternalLinkIcon, PencilIcon, Trash2Icon } from "lucide-react";

type Lead = Awaited<ReturnType<typeof api.lead.show>>;

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
  const communityCount = lead.communities.length;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <PictureAvatar
          className="size-14"
          name={lead.name}
          src={lead.pictureUrl}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <AdminPageTitle>{lead.name}</AdminPageTitle>
          <AdminPageDescription>@{lead.username}</AdminPageDescription>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tip
          label="Open their Skool profile in a new tab"
          render={
            <Button
              render={
                <a href={lead.skoolUrl} rel="noreferrer" target="_blank" />
              }
              variant="outline"
            />
          }
        >
          <ExternalLinkIcon />
          View on Skool
        </Tip>
        <Tip
          label="Change this lead's details"
          render={
            <Button
              render={
                <Link
                  params={{ leadId: lead.leadId }}
                  to="/admin/leads/$leadId/edit"
                />
              }
              variant="outline"
            />
          }
        >
          <PencilIcon />
          Edit
        </Tip>
        <AlertDialog>
          <Tip
            label="Delete this lead and their communities"
            render={
              <AlertDialogTrigger
                render={
                  <Button disabled={isRemovePending} variant="destructive" />
                }
              />
            }
          >
            {isRemovePending ? <Spinner /> : <Trash2Icon />}
            Delete
          </Tip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
              <AlertDialogDescription>
                {communityCount === 0
                  ? `This permanently deletes ${lead.name}.`
                  : `This permanently deletes ${lead.name} and ${communityCount === 1 ? "their community" : `their ${communityCount} communities`}.`}{" "}
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
