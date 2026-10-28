import { CustomInput } from "@/components/custom-input";
import { CustomTextarea } from "@/components/custom-textarea";
import { RequiredIndicator } from "@/components/required-indicator";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  inputMode?: "numeric" | "decimal" | "url";
  wrapperClassName?: string;
}

export const TextField = <T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  required,
  disabled,
  multiline,
  inputMode,
  wrapperClassName,
}: TextFieldProps<T>) => (
  <div className={wrapperClassName}>
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel htmlFor={field.name}>
            {label}
            {required && <RequiredIndicator />}
          </FieldLabel>
          {multiline ? (
            <CustomTextarea
              {...field}
              aria-invalid={fieldState.invalid}
              disabled={disabled}
              id={field.name}
              placeholder={placeholder}
              value={String(field.value ?? "")}
            />
          ) : (
            <CustomInput
              {...field}
              aria-invalid={fieldState.invalid}
              disabled={disabled}
              id={field.name}
              inputMode={inputMode}
              placeholder={placeholder}
              value={String(field.value ?? "")}
            />
          )}
          {description && !fieldState.invalid && (
            <FieldDescription>{description}</FieldDescription>
          )}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  </div>
);
