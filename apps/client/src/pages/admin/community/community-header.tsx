import { api } from "@/api";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { PictureAvatar } from "@/components/picture-avatar";
import { Tip } from "@/components/tip";
import { displayUrl } from "@/lib/format";
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

type Community = Awaited<ReturnType<typeof api.community.show>>;

interface CommunityHeaderProps {
  community: Community;
  isRemovePending: boolean;
  onRemove: () => void;
}

export const CommunityHeader = ({
  community,
  isRemovePending,
  onRemove,
}: CommunityHeaderProps) => {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <PictureAvatar
          className="size-14"
          name={community.name}
          src={community.logoUrl ?? community.thumbnailUrl}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <AdminPageTitle>{community.name}</AdminPageTitle>
          <AdminPageDescription>
            {displayUrl(community.skoolUrl)}
          </AdminPageDescription>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tip
          label="Open the community on Skool in a new tab"
          render={
            <Button
              render={
                <a href={community.skoolUrl} rel="noreferrer" target="_blank" />
              }
              variant="outline"
            />
          }
        >
          <ExternalLinkIcon />
          View on Skool
        </Tip>
        <Tip
          label="Change this community's details"
          render={
            <Button
              render={
                <Link
                  params={{ communityId: community.communityId }}
                  to="/admin/communities/$communityId/edit"
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
            label="Delete this community"
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
              <AlertDialogTitle>Delete this community?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes {community.name}. This action cannot be
                undone.
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
