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
import { Trash2Icon } from "lucide-react";

interface BulkDeleteButtonProps {
  /** What the dialog tells the user will be lost, e.g. "3 leads and their 5 communities" */
  consequence: string;
  isPending: boolean;
  label: string;
  onConfirm: () => void;
  title: string;
}

export const BulkDeleteButton = ({
  consequence,
  isPending,
  label,
  onConfirm,
  title,
}: BulkDeleteButtonProps) => (
  <AlertDialog>
    <Tip
      label={isPending ? "Deleting…" : "Delete everything selected"}
      render={
        <AlertDialogTrigger
          render={
            <Button disabled={isPending} size="sm" variant="destructive" />
          }
        />
      }
    >
      {isPending ? <Spinner /> : <Trash2Icon />}
      {label}
    </Tip>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently deletes {consequence}. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} variant="destructive">
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
