import { api } from "@/api";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@repo/ui/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import { CustomInput } from "@/components/custom-input";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { onError } from "@/lib/base-api";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";

const schema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(60),
    passwordConfirmation: z.string().min(8).max(60),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords don't match",
    path: ["passwordConfirmation"],
  });

type Output = z.output<typeof schema>;

export const SetupPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const setup = useMutation({
    mutationFn: (output: Output) => {
      return api.platformSetup.setup({
        email: output.email,
        password: output.password,
      });
    },
    onSuccess: () => {
      toast.success(t("setup.successToast"));
      navigate({ to: "/sign-in" });
    },
    onError,
  });

  const onSubmit = (output: Output) => {
    setup.mutate(output);
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-sm">
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>{t("setup.email")}</FieldLabel>
                <CustomInput
                  {...field}
                  type="email"
                  id={field.name}
                  placeholder="example@example.com"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("setup.password")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder="********"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="passwordConfirmation"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("setup.confirmPassword")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id={field.name}
                  placeholder="********"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Button type="submit" disabled={setup.isPending}>
            {setup.isPending && <Spinner />}
            {t("setup.submit")}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
};
