import { FilterSelect } from "@/components/filter-select";
import { Tip } from "@/components/tip";
import type { CampaignOption } from "@/hooks/use-campaign-options";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { MegaphoneIcon } from "lucide-react";
import { useState } from "react";

const unchosen = "";

interface AddToCampaignButtonProps {
  campaigns: CampaignOption[];
  isPending: boolean;
  onConfirm: (campaignId: number) => Promise<unknown>;
  /** What is being added, e.g. "3 leads" */
  subject: string;
}

export const AddToCampaignButton = ({
  campaigns,
  isPending,
  onConfirm,
  subject,
}: AddToCampaignButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(unchosen);

  const confirm = async () => {
    try {
      await onConfirm(Number(campaignId));
      setIsOpen(false);
      setCampaignId(unchosen);
    } catch {
      return;
    }
  };

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <Tip
        label="Put everything selected into a campaign"
        render={
          <DialogTrigger render={<Button size="sm" variant="outline" />} />
        }
      >
        <MegaphoneIcon />
        Add to campaign
      </Tip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Add ${subject} to a campaign`}</DialogTitle>
          <DialogDescription>
            Anything already in the campaign is skipped. You can remove it from
            the campaign later.
          </DialogDescription>
        </DialogHeader>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have no campaigns yet.{" "}
            <Link className="underline" to="/admin/campaigns/new">
              Create one
            </Link>{" "}
            first.
          </p>
        ) : (
          <FilterSelect
            label="Campaign"
            onChange={setCampaignId}
            options={[
              { value: unchosen, label: "Choose a campaign" },
              ...campaigns,
            ]}
            value={campaignId}
          />
        )}
        <DialogFooter>
          <Tip
            label={
              campaignId === unchosen
                ? "Choose a campaign first"
                : "Add them to this campaign"
            }
            render={
              <Button
                disabled={campaignId === unchosen || isPending}
                onClick={confirm}
              />
            }
          >
            {isPending && <Spinner />}
            Add to campaign
          </Tip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
