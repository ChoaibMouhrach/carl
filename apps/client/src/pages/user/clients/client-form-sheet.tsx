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

type Client = Awaited<ReturnType<typeof api.client.list>>["clients"][number];

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.email().max(255),
});

type Output = z.output<typeof schema>;

interface ClientFormSheetProps {
  client: Client | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Output) => void;
  open: boolean;
}

export const ClientFormSheet = ({
  client,
  isPending,
  onOpenChange,
  onSubmit,
  open,
}: ClientFormSheetProps) => {
  const { t } = useTranslation();
  const isEdit = client !== null;
  const [pendingValues, setPendingValues] = useState<Output | null>(null);

  const defaultValues: Output = {
    name: client?.name ?? "",
    email: client?.email ?? "",
  };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

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
              {isEdit ? t("clients.editTitle") : t("clients.createTitle")}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? t("clients.editDescription")
                : t("clients.createDescription")}
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
                        {t("clients.name")}
                        <RequiredIndicator />
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        placeholder={t("clients.namePlaceholder")}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        {t("clients.email")}
                        <RequiredIndicator />
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        placeholder={t("clients.emailPlaceholder")}
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
                {t("clients.save")}
              </Button>
              <Button
                disabled={isPending}
                onClick={() => form.reset(defaultValues)}
                type="button"
                variant="outline"
              >
                {t("clients.reset")}
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
            <AlertDialogTitle>{t("clients.editConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.editConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingValues) onSubmit(pendingValues);
              }}
            >
              {t("clients.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
