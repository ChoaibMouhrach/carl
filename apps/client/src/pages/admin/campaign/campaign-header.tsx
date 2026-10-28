import { api } from "@/api";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { Tip } from "@/components/tip";
import { formatCurrency, formatNumber } from "@/lib/format";
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
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { PauseIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react";

type CampaignDetails = Awaited<ReturnType<typeof api.campaign.show>>;

interface CampaignHeaderProps {
  campaign: CampaignDetails;
  isRemovePending: boolean;
  isTogglePending: boolean;
  onRemove: () => void;
  onToggleActive: () => void;
}

export const CampaignHeader = ({
  campaign,
  isRemovePending,
  isTogglePending,
  onRemove,
  onToggleActive,
}: CampaignHeaderProps) => (
  <header className="flex flex-wrap items-start justify-between gap-4">
    <div className="flex min-w-0 flex-col gap-2">
      <AdminPageTitle>{campaign.name}</AdminPageTitle>
      {campaign.description && (
        <AdminPageDescription>{campaign.description}</AdminPageDescription>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={campaign.isActive ? "default" : "outline"}>
          {campaign.isActive ? "Active" : "Inactive"}
        </Badge>
        <Badge variant="outline">{`Searches “${campaign.keyword}”`}</Badge>
        <Badge variant="secondary">
          {!campaign.minPriceCents
            ? "Any price"
            : `${formatCurrency(campaign.minPriceCents / 100, "USD")}+ / month`}
        </Badge>
        <Badge variant="secondary">
          {!campaign.minMembers
            ? "Any size"
            : `${formatNumber(campaign.minMembers)}+ members`}
        </Badge>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Tip
        label={
          campaign.isActive ? "Pause this campaign" : "Resume this campaign"
        }
        render={
          <Button
            disabled={isTogglePending}
            onClick={onToggleActive}
            variant="outline"
          />
        }
      >
        {isTogglePending ? (
          <Spinner />
        ) : campaign.isActive ? (
          <PauseIcon />
        ) : (
          <PlayIcon />
        )}
        {campaign.isActive ? "Deactivate" : "Activate"}
      </Tip>
      <Tip
        label="Change this campaign's search and minimums"
        render={
          <Button
            render={
              <Link
                params={{ campaignId: campaign.campaignId }}
                to="/admin/campaigns/$campaignId/edit"
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
          label="Delete this campaign, keeping its leads and communities"
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
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {campaign.name}. Its leads and
              communities are kept. This action cannot be undone.
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
