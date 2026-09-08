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

type FileRecord = Awaited<ReturnType<typeof api.file.list>>["files"][number];

const schema = z.object({
  name: z.string().min(1).max(255),
});

type Output = z.output<typeof schema>;

interface FileRenameSheetProps {
  file: FileRecord | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Output) => void;
}

export const FileRenameSheet = ({
  file,
  isPending,
  onOpenChange,
  onSubmit,
}: FileRenameSheetProps) => {
  const { t } = useTranslation();
  const open = file !== null;
  const [pendingValues, setPendingValues] = useState<Output | null>(null);

  const defaultValues: Output = { name: file?.name ?? "" };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("files.renameTitle")}</SheetTitle>
            <SheetDescription>{t("files.renameDescription")}</SheetDescription>
          </SheetHeader>

          <form
            className="flex flex-1 flex-col"
            onSubmit={form.handleSubmit((values) => setPendingValues(values))}
          >
            <div className="flex-1 px-4">
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        {t("files.name")}
                        <RequiredIndicator />
                      </FieldLabel>
                      <Input {...field} id={field.name} />
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
                {t("files.save")}
              </Button>
              <Button
                disabled={isPending}
                onClick={() => form.reset(defaultValues)}
                type="button"
                variant="outline"
              >
                {t("files.reset")}
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
            <AlertDialogTitle>{t("files.renameConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("files.renameConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("files.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingValues) onSubmit(pendingValues);
              }}
            >
              {t("files.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
