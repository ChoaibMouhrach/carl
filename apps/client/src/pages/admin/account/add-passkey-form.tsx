import { CustomInput } from "@/components/custom-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/ui/field";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { KeyRoundIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";

const schema = z.object({
  name: z.string().trim().max(60),
});

type Output = z.output<typeof schema>;

interface AddPasskeyFormProps {
  isPending: boolean;
  onSubmit: (output: Output) => Promise<unknown>;
}

export const AddPasskeyForm = ({
  isPending,
  onSubmit,
}: AddPasskeyFormProps) => {
  const form = useForm({
    defaultValues: { name: "" },
    resolver: zodResolver(schema),
  });

  const submit = form.handleSubmit(async (output) => {
    try {
      await onSubmit(output);
      form.reset();
    } catch {
      return;
    }
  });

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <div className="max-w-sm flex-1">
            <Field>
              <FieldLabel htmlFor={field.name}>Passkey name</FieldLabel>
              <CustomInput
                {...field}
                id={field.name}
                placeholder="e.g. MacBook Touch ID (optional)"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          </div>
        )}
      />
      <Button disabled={isPending} type="submit">
        {isPending ? <Spinner /> : <KeyRoundIcon />}
        Add passkey
      </Button>
    </form>
  );
};
