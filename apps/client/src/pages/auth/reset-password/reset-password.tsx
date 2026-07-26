import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import i18n from "@/lib/i18n";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@repo/ui/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldError,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { onError } from "@/lib/base-api";
import { resetPasswordRoute } from "@/routes/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";
import { Separator } from "@repo/ui/components/ui/separator";

const schema = z
  .object({
    password: z.string().min(8).max(60),
    passwordConfirmation: z.string().min(8).max(60),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    error: () => i18n.t("validation.passwordsMatch"),
    path: ["passwordConfirmation"],
  });

type Output = z.output<typeof schema>;

export const ResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const search = resetPasswordRoute.useSearch();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
      passwordConfirmation: "",
    },
  });

  const resetPassword = useMutation({
    mutationFn: (output: Output) => {
      return unwrapAuthResponse(
        authClient.resetPassword({
          newPassword: output.password,
          token: search.token,
        }),
      );
    },
    onSuccess: () => {
      toast.success(t("auth.resetPassword.successToast"));
      navigate({ to: "/sign-in" });
    },
    onError,
  });

  const onSubmit = (output: Output) => {
    resetPassword.mutate(output);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.resetPassword.password")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id={field.name}
                type="password"
                placeholder="********"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="passwordConfirmation"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.resetPassword.confirmPassword")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id={field.name}
                type="password"
                placeholder="********"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Button type="submit" disabled={resetPassword.isPending}>
          {resetPassword.isPending && <Spinner />}{" "}
          {t("auth.resetPassword.submit")}
        </Button>

        <div className="flex items-center gap-4 text-muted-foreground">
          <Separator className="shrink flex-1" />
          <span className="text-sm">{t("common.or")}</span>
          <Separator className="shrink flex-1" />
        </div>

        <Button
          size="lg"
          variant="outline"
          disabled={resetPassword.isPending}
          asChild
        >
          <Link to="/sign-in">{t("common.signIn")}</Link>
        </Button>
      </FieldGroup>
    </form>
  );
};
