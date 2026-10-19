import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
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
import { toast } from "sonner";
import z from "zod";

const schema = z
  .object({
    currentPassword: z.string().min(8).max(60),
    newPassword: z.string().min(8).max(60),
    confirmPassword: z.string().min(8).max(60),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: () => "Passwords don't match",
    path: ["confirmPassword"],
  });

type Output = z.output<typeof schema>;

export const ChangePassword = () => {
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
      unwrapAuthResponse(
        authClient.changePassword({
          currentPassword: input.output.currentPassword,
          newPassword: input.output.newPassword,
          revokeOtherSessions: input.revokeOtherSessions,
        }),
      ),
    onSuccess: () => {
      toast.success("Password changed successfully");
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
                <FieldLabel htmlFor={field.name}>Current password</FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder="Enter your current password"
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
                <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder="Enter your new password"
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
                  Confirm new password
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder="Confirm your new password"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Button type="submit" disabled={mutation.isPending} className="w-fit">
            {mutation.isPending && <Spinner />}
            Change password
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
            <AlertDialogTitle>Sign out other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Your password will be changed. Would you also like to sign out all
              other active sessions? Your current session will stay active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => handleConfirm(false)}
            >
              {mutation.isPending && <Spinner />}
              No, keep them
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => handleConfirm(true)}
            >
              {mutation.isPending && <Spinner />}
              Yes, sign them out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
