import { CustomInput } from "@/components/custom-input";
import { Tip } from "@/components/tip";
import { leadEmailSourceLabels } from "@/lib/lead-email";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Field, FieldError } from "@repo/ui/components/ui/field";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import type { LeadFormInput } from "./lead-form";

interface LeadFormEmailsProps {
  control: Control<LeadFormInput>;
  errors: FieldErrors<LeadFormInput>;
}

export const LeadFormEmails = ({ control, errors }: LeadFormEmailsProps) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "emails",
  });

  return (
    <div className="space-y-2 sm:col-span-2">
      {fields.map((item, index) => (
        <Controller
          control={control}
          key={item.id}
          name={`emails.${index}.address`}
          render={({ field, fieldState }) => (
            <Field>
              <div className="flex items-center gap-2">
                <CustomInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  aria-label={`Email ${index + 1}`}
                  placeholder="jane@example.com"
                />
                {item.source && (
                  <Badge variant="outline">
                    {leadEmailSourceLabels[item.source]}
                  </Badge>
                )}
                <Tip
                  label="Remove this email"
                  render={
                    <Button
                      aria-label={`Remove address ${index + 1}`}
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="outline"
                    />
                  }
                >
                  <Trash2Icon />
                </Tip>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      ))}
      {errors.emails?.root && <FieldError errors={[errors.emails.root]} />}
      <Tip
        label="Add another email address"
        render={
          <Button
            onClick={() => append({ address: "", source: null })}
            type="button"
            variant="outline"
          />
        }
      >
        <PlusIcon />
        Add email
      </Tip>
    </div>
  );
};
