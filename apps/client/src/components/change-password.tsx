import { api } from "@/api";
import i18n from "@/lib/i18n";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@repo/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { onError } from "@/lib/base-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import z from "zod";

const schema = z
  .object({
    currentPassword: z.string().min(8).max(60),
    newPassword: z.string().min(8).max(60),
    confirmPassword: z.string().min(8).max(60),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: () => i18n.t("validation.passwordsMatch"),
    path: ["confirmPassword"],
  });

type Output = z.output<typeof schema>;

export const ChangePassword = () => {
  const { t } = useTranslation();
  const [pendingOutput, setPendingOutput] = useState<Output | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (input: { output: Output; revokeOtherSessions: boolean }) =>
      api.auth.changePassword({
        currentPassword: input.output.currentPassword,
        newPassword: input.output.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
      }),
    onSuccess: () => {
      toast.success(t("password.changedToast"));
      form.reset();
      setPendingOutput(null);
    },
    onError: (err) => {
      setPendingOutput(null);
      onError(err);
    },
  });

  const handleSubmit = (output: Output) => {
    setPendingOutput(output);
  };

  const handleConfirm = (revokeOtherSessions: boolean) => {
    if (!pendingOutput) return;
    mutation.mutate({ output: pendingOutput, revokeOtherSessions });
  };

  return (
    <>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <FieldGroup>
          <Controller
            name="currentPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("password.current")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder={t("password.currentPlaceholder")}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="newPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("password.new")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder={t("password.newPlaceholder")}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("password.confirm")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder={t("password.confirmPlaceholder")}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Button type="submit" disabled={mutation.isPending} className="w-fit">
            {mutation.isPending && <Spinner />}
            {t("password.submit")}
          </Button>
        </FieldGroup>
      </form>

      <AlertDialog
        open={pendingOutput !== null && !mutation.isPending}
        onOpenChange={(open) => {
          if (!open) setPendingOutput(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("password.dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("password.dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => handleConfirm(false)}
            >
              {mutation.isPending && <Spinner />}
              {t("password.dialog.keep")}
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => handleConfirm(true)}
            >
              {mutation.isPending && <Spinner />}
              {t("password.dialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
