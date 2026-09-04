import { api } from "@/api";
import { RequiredIndicator } from "@/components/required-indicator";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import { Input } from "@repo/ui/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";

type Folder = Awaited<ReturnType<typeof api.folder.list>>["folders"][number];

const schema = z.object({
  name: z.string().min(1).max(255),
});

type Output = z.output<typeof schema>;

interface FolderFormSheetProps {
  folder: Folder | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Output) => void;
  open: boolean;
}

export const FolderFormSheet = ({
  folder,
  isPending,
  onOpenChange,
  onSubmit,
  open,
}: FolderFormSheetProps) => {
  const { t } = useTranslation();
  const isEdit = folder !== null;
  const [pendingValues, setPendingValues] = useState<Output | null>(null);

  const defaultValues: Output = {
    name: folder?.name ?? "",
  };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder]);

  const handleSubmit = (values: Output) => {
    if (isEdit) {
      setPendingValues(values);
    } else {
      onSubmit(values);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {isEdit
                ? t("clientFolders.editTitle")
                : t("clientFolders.createTitle")}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? t("clientFolders.editDescription")
                : t("clientFolders.createDescription")}
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex flex-1 flex-col"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="flex-1 px-4">
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        {t("clientFolders.name")}
                        <RequiredIndicator />
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        placeholder={t("clientFolders.namePlaceholder")}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>

            <SheetFooter className="flex-row">
              <Button disabled={isPending} type="submit">
                {isPending && <Spinner />}
                {t("clientFolders.save")}
              </Button>
              <Button
                disabled={isPending}
                onClick={() => form.reset(defaultValues)}
                type="button"
                variant="outline"
              >
                {t("clientFolders.reset")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingValues !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingValues(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clientFolders.editConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clientFolders.editConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clientFolders.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingValues) onSubmit(pendingValues);
              }}
            >
              {t("clientFolders.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
