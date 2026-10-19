import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
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
import z from "zod";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";

const schema = z.object({
  email: z.email().max(255),
});

type Output = z.output<typeof schema>;

export const ForgotPassword = () => {
  const form = useForm({
    resolver: zodResolver(schema),
    values: {
      email: "",
    },
  });

  const forgotPassword = useMutation({
    mutationFn: (output: Output) => {
      return unwrapAuthResponse(
        authClient.requestPasswordReset({
          email: output.email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      );
    },
    onSuccess: () => {
      toast.success(
        "If an account exists with that email, you'll receive a reset link shortly",
      );
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
              <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
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
          {forgotPassword.isPending && <Spinner />} Send Reset Link
        </Button>

        <div className="flex items-center gap-4 text-muted-foreground">
          <Separator className="shrink flex-1" />
          <span className="text-sm">OR</span>
          <Separator className="shrink flex-1" />
        </div>

        <Button
          size="lg"
          variant="outline"
          disabled={forgotPassword.isPending}
          nativeButton={false}
          render={<Link to="/sign-in" />}
        >
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
};
