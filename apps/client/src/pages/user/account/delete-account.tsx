import { ACCOUNT_DELETION_CONFIRMATION } from "@repo/constants/auth";
import { api } from "@/api";
import { CustomInput } from "@/components/custom-input";
import { onError } from "@/lib/base-api";
import {
  AlertDialog,
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
import { Spinner } from "@repo/ui/components/ui/spinner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";

const createSchema = (message: string) =>
  z.object({
    confirmation: z
      .string()
      .refine((value) => value === ACCOUNT_DELETION_CONFIRMATION, { message }),
  });

export const DeleteAccount = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const schema = createSchema(t("validation.accountDeletionConfirmation"));
  const form = useForm({
    defaultValues: {
      confirmation: "",
    },
    resolver: zodResolver(schema),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.account.remove({
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    onError,
    onSuccess: () => {
      setOpen(false);
      void navigate({ to: "/sign-in" });
    },
  });

  const onOpenChange = (nextOpen: boolean) => {
    if (mutation.isPending) {
      return;
    }

    setOpen(nextOpen);

    if (!nextOpen) {
      form.reset();
    }
  };

  const onSubmit = () => {
    mutation.mutate();
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t("settings.deleteAccount.trigger")}
      </Button>

      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.deleteAccount.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.deleteAccount.dialog.description", {
                confirmation: ACCOUNT_DELETION_CONFIRMATION,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
              <Controller
                control={form.control}
                name="confirmation"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      {t("settings.deleteAccount.dialog.label")}
                    </FieldLabel>
                    <CustomInput
                      {...field}
                      autoComplete="off"
                      id={field.name}
                      placeholder={ACCOUNT_DELETION_CONFIRMATION}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <AlertDialogFooter>
                <Button
                  disabled={mutation.isPending}
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="outline"
                >
                  {t("settings.deleteAccount.dialog.cancel")}
                </Button>
                <Button
                  disabled={mutation.isPending}
                  type="submit"
                  variant="destructive"
                >
                  {mutation.isPending && <Spinner />}
                  {t("settings.deleteAccount.dialog.confirm")}
                </Button>
              </AlertDialogFooter>
            </FieldGroup>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
