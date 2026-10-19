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
import z from "zod";

const schema = z
  .object({
    name: z.string().trim().min(1).max(255),
    email: z.email(),
    password: z.string().min(8).max(60),
    passwordConfirmation: z.string().min(8).max(60),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    error: () => "Passwords don't match",
    path: ["passwordConfirmation"],
  });

type Output = z.output<typeof schema>;

export const SetupPage = () => {
  const navigate = useNavigate();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const setup = useMutation({
    mutationFn: (output: Output) => {
      return api.platformSetup.setup({
        email: output.email,
        name: output.name,
        password: output.password,
      });
    },
    onSuccess: () => {
      toast.success("Setup completed successfully");
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
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Full name</FieldLabel>
                <CustomInput
                  {...field}
                  id={field.name}
                  placeholder="Jane Doe"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

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
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
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
                <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
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
            Submit
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
};
