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
import { Separator } from "@repo/ui/components/ui/separator";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { onError } from "@/lib/base-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import z from "zod";

const schema = z
  .object({
    email: z.email().max(255),
    password: z.string().min(8).max(60),
    passwordConfirmation: z.string().min(8).max(60),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords don't match",
    path: ["passwordConfirmation"],
  });

type Output = z.output<typeof schema>;

export const SignUp = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    resolver: zodResolver(schema),
    values: {
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const signUp = useMutation({
    mutationFn: (output: Output) => {
      return api.auth.signUp({
        email: output.email,
        password: output.password,
      });
    },
    onSuccess: () => {
      toast.success(t("auth.signUp.verifyEmailToast"));
      navigate({ to: "/sign-in" });
    },
    onError,
  });

  const onSubmit = (output: Output) => {
    signUp.mutate(output);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.signUp.email")}
              </FieldLabel>
              <CustomInput
                {...field}
                id={field.name}
                type="email"
                placeholder="example@example.com"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.signUp.password")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id={field.name}
                placeholder="********"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="passwordConfirmation"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.signUp.confirmPassword")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id={field.name}
                placeholder="********"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Button type="submit" disabled={signUp.isPending}>
          {signUp.isPending && <Spinner />} {t("auth.signUp.submit")}
        </Button>

        <div className="flex items-center gap-4 text-muted-foreground">
          <Separator className="shrink flex-1" />
          <span className="text-sm">{t("common.or")}</span>
          <Separator className="shrink flex-1" />
        </div>

        <Button size="lg" variant="outline" disabled={signUp.isPending} asChild>
          <Link to="/sign-in">{t("common.signIn")}</Link>
        </Button>
      </FieldGroup>
    </form>
  );
};
