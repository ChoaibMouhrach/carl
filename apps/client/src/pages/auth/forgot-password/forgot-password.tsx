import { api } from "@/api";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";

const schema = z.object({
  email: z.email().max(255),
});

type Output = z.output<typeof schema>;

export const ForgotPassword = () => {
  const { t } = useTranslation();

  const form = useForm({
    resolver: zodResolver(schema),
    values: {
      email: "",
    },
  });

  const forgotPassword = useMutation({
    mutationFn: (output: Output) => {
      return api.auth.forgotPassword({
        email: output.email,
      });
    },
    onSuccess: () => {
      toast.success(t("auth.forgotPassword.sentToast"));
    },
    onError,
  });

  const onSubmit = (output: Output) => {
    forgotPassword.mutate(output);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("auth.forgotPassword.email")}
              </FieldLabel>
              <CustomInput
                {...field}
                type="email"
                id={field.name}
                placeholder="example@example.com"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Button type="submit" disabled={forgotPassword.isPending}>
          {forgotPassword.isPending && <Spinner />}{" "}
          {t("auth.forgotPassword.submit")}
        </Button>

        <div className="flex items-center gap-4 text-muted-foreground">
          <Separator className="shrink flex-1" />
          <span className="text-sm">{t("common.or")}</span>
          <Separator className="shrink flex-1" />
        </div>

        <Button
          size="lg"
          variant="outline"
          disabled={forgotPassword.isPending}
          asChild
        >
          <Link to="/sign-in">{t("common.signIn")}</Link>
        </Button>
      </FieldGroup>
    </form>
  );
};
