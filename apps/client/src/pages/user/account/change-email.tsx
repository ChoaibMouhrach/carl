import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { onError } from "@/lib/base-api";
import { CustomInput } from "@/components/custom-input";
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
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import z from "zod";

const schema = z.object({
  email: z.email().max(255),
});

type Output = z.output<typeof schema>;

export const ChangeEmail = ({ email }: { email: string }) => {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: { email: "" },
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (output: Output) =>
      unwrapAuthResponse(
        authClient.changeEmail({
          callbackURL: `${window.location.origin}/app/user/account`,
          newEmail: output.email,
        }),
      ),
    onError,
    onSuccess: () => {
      form.reset();
      toast.success(t("settings.emailChange.requestedToast"));
    },
  });

  return (
    <form onSubmit={form.handleSubmit((output) => mutation.mutate(output))}>
      <FieldGroup>
        <Field>
          <FieldLabel>{t("settings.profile.email")}</FieldLabel>
          <CustomInput disabled value={email} />
        </Field>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("settings.emailChange.newEmail")}
              </FieldLabel>
              <CustomInput
                {...field}
                id={field.name}
                placeholder="name@example.com"
                type="email"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button disabled={mutation.isPending} type="submit" className="w-fit">
          {mutation.isPending && <Spinner />}
          {t("settings.emailChange.submit")}
        </Button>
      </FieldGroup>
    </form>
  );
};
