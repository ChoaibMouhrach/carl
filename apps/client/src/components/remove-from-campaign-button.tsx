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
import { MinusCircleIcon } from "lucide-react";

interface RemoveFromCampaignButtonProps {
  isPending: boolean;
  onConfirm: () => void;
  /** What is being removed, e.g. "3 leads" */
  subject: string;
}

export const RemoveFromCampaignButton = ({
  isPending,
  onConfirm,
  subject,
}: RemoveFromCampaignButtonProps) => (
  <AlertDialog>
    <Tip
      label="Take everything selected out of this campaign"
      render={
        <AlertDialogTrigger
          render={
            <Button disabled={isPending} size="sm" variant="destructive" />
          }
        />
      }
    >
      {isPending ? <Spinner /> : <MinusCircleIcon />}
      {`Remove ${subject}`}
    </Tip>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{`Remove ${subject} from this campaign?`}</AlertDialogTitle>
        <AlertDialogDescription>
          They are only taken out of the campaign. Nothing is deleted, and you
          can add them again later.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} variant="destructive">
          Remove
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
