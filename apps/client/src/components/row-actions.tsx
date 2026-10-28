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
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

interface RowActionsProps {
  cancelLabel: string;
  deleteDescription: string;
  deleteLabel: string;
  deleteTitle: string;
  edit?: React.ReactElement;
  extraActions?: React.ReactNode;
  editLabel?: string;
  isDeleting: boolean;
  isDisabled: boolean;
  menuLabel: string;
  onDelete: () => void;
}

export const RowActions = ({
  cancelLabel,
  deleteDescription,
  deleteLabel,
  deleteTitle,
  edit,
  extraActions,
  editLabel,
  isDeleting,
  isDisabled,
  menuLabel,
  onDelete,
}: RowActionsProps) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <div
      className="flex justify-end"
      onClick={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <Tip
          label={menuLabel}
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={menuLabel}
                  disabled={isDisabled}
                  size="icon"
                  variant="ghost"
                />
              }
            />
          }
        >
          {isDeleting ? <Spinner /> : <MoreHorizontalIcon />}
        </Tip>
        <DropdownMenuContent align="end">
          {edit && (
            <DropdownMenuItem render={edit}>
              <PencilIcon />
              {editLabel}
            </DropdownMenuItem>
          )}
          {extraActions}
          <DropdownMenuItem
            onClick={() => setIsDeleteOpen(true)}
            variant="destructive"
          >
            <Trash2Icon />
            {deleteLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={onDelete}
              variant="destructive"
            >
              {deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
