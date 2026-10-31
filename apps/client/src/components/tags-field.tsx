import { RequiredIndicator } from "@/components/required-indicator";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from "@repo/ui/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import { useState } from "react";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

interface TagsFieldProps<T extends FieldValues> {
  control: Control<T>;
  description?: string;
  label: string;
  max: number;
  name: Path<T>;
  placeholder: string;
  required?: boolean;
  wrapperClassName?: string;
}

const clean = (values: string[], max: number) => {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
};

export const TagsField = <T extends FieldValues>({
  control,
  description,
  label,
  max,
  name,
  placeholder,
  required,
  wrapperClassName,
}: TagsFieldProps<T>) => {
  const [input, setInput] = useState("");

  return (
    <div className={wrapperClassName}>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => {
          const tags: string[] = Array.isArray(field.value) ? field.value : [];

          const add = () => {
            field.onChange(clean([...tags, input], max));
            setInput("");
          };

          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={name}>
                {label}
                {required && <RequiredIndicator />}
              </FieldLabel>
              <Combobox
                inputValue={input}
                items={[]}
                multiple
                onInputValueChange={setInput}
                onValueChange={(next) => field.onChange(clean(next, max))}
                open={false}
                value={tags}
              >
                <ComboboxChips>
                  <ComboboxValue>
                    {(current: string[]) => (
                      <>
                        {current.map((tag) => (
                          <ComboboxChip key={tag}>{tag}</ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          aria-invalid={fieldState.invalid}
                          id={name}
                          onBlur={() => {
                            if (input.trim()) add();
                            field.onBlur();
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== ",")
                              return;

                            event.preventDefault();
                            if (input.trim()) add();
                          }}
                          placeholder={current.length ? undefined : placeholder}
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
              </Combobox>
              {description && !fieldState.invalid && (
                <FieldDescription>{description}</FieldDescription>
              )}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          );
        }}
      />
    </div>
  );
};
