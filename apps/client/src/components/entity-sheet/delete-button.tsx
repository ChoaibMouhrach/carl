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

interface DeleteButtonProps {
  description: string;
  isPending: boolean;
  onConfirm: () => void;
  title: string;
  tooltip: string;
}

export const DeleteButton = ({
  description,
  isPending,
  onConfirm,
  title,
  tooltip,
}: DeleteButtonProps) => (
  <AlertDialog>
    <Tip
      label={tooltip}
      render={
        <AlertDialogTrigger
          render={<Button disabled={isPending} variant="destructive" />}
        />
      }
    >
      {isPending ? <Spinner /> : <Trash2Icon />}
      Delete
    </Tip>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
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
