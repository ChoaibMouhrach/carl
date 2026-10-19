import { RequiredIndicator } from "@/components/required-indicator";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  required?: boolean;
}

export const SelectField = <T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  required,
}: SelectFieldProps<T>) => (
  <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <FieldLabel htmlFor={field.name}>
          {label}
          {required && <RequiredIndicator />}
        </FieldLabel>
        <Select
          items={options}
          onValueChange={field.onChange}
          value={field.value || null}
        >
          <SelectTrigger id={field.name}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )}
  />
);
