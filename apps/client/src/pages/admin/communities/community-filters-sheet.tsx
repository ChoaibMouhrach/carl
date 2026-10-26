import { CustomInput } from "@/components/custom-input";
import { Tip } from "@/components/tip";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@repo/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";

export interface CommunityRangeFilters {
  hasEmail?: boolean;
  minMembers?: number;
  maxMembers?: number;
  minMrr?: number;
  maxMrr?: number;
}

interface CommunityFiltersSheetProps {
  filters: CommunityRangeFilters;
  onApply: (filters: CommunityRangeFilters) => void;
}

const wholeNumber = z
  .string()
  .trim()
  .regex(/^\d*$/, "Enter a whole number, or leave empty");

const schema = z
  .object({
    hasEmail: z.enum(["any", "with", "without"]),
    minMembers: wholeNumber,
    maxMembers: wholeNumber,
    minMrr: wholeNumber,
    maxMrr: wholeNumber,
  })
  .superRefine((value, ctx) => {
    const pairs = [
      ["minMembers", "maxMembers", "Max members must be at least the minimum"],
      ["minMrr", "maxMrr", "Max MRR must be at least the minimum"],
    ] as const;

    for (const [min, max, message] of pairs) {
      if (value[min] && value[max] && Number(value[min]) > Number(value[max])) {
        ctx.addIssue({ code: "custom", message, path: [max] });
      }
    }
  });

type FormInput = z.input<typeof schema>;

const emailItems = [
  { value: "any", label: "Any email" },
  { value: "with", label: "Has an email" },
  { value: "without", label: "No email" },
];

const toNumber = (value: string) => (value === "" ? undefined : Number(value));

const NumberField = ({
  control,
  description,
  label,
  name,
  placeholder,
}: {
  control: ReturnType<typeof useForm<FormInput>>["control"];
  description?: string;
  label: string;
  name: "minMembers" | "maxMembers" | "minMrr" | "maxMrr";
  placeholder: string;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => (
      <Field>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        <CustomInput
          {...field}
          id={field.name}
          inputMode="numeric"
          placeholder={placeholder}
        />
        {description && !fieldState.invalid && (
          <FieldDescription>{description}</FieldDescription>
        )}
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )}
  />
);

const FiltersForm = ({
  filters,
  onApply,
  onDone,
}: CommunityFiltersSheetProps & { onDone: () => void }) => {
  const form = useForm<FormInput>({
    defaultValues: {
      hasEmail:
        filters.hasEmail === undefined
          ? "any"
          : filters.hasEmail
            ? "with"
            : "without",
      minMembers: filters.minMembers?.toString() ?? "",
      maxMembers: filters.maxMembers?.toString() ?? "",
      minMrr: filters.minMrr?.toString() ?? "",
      maxMrr: filters.maxMrr?.toString() ?? "",
    },
    resolver: zodResolver(schema),
  });

  const submit = form.handleSubmit((input) => {
    onApply({
      hasEmail:
        input.hasEmail === "any" ? undefined : input.hasEmail === "with",
      minMembers: toNumber(input.minMembers),
      maxMembers: toNumber(input.maxMembers),
      minMrr: toNumber(input.minMrr),
      maxMrr: toNumber(input.maxMrr),
    });
    onDone();
  });

  const reset = () => {
    // Explicit undefined, because merging an empty object would keep the old params
    onApply({
      hasEmail: undefined,
      minMembers: undefined,
      maxMembers: undefined,
      minMrr: undefined,
      maxMrr: undefined,
    });
    onDone();
  };

  return (
    <form className="flex flex-1 flex-col gap-5 px-4" onSubmit={submit}>
      <Controller
        control={form.control}
        name="hasEmail"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Email</FieldLabel>
            <Select
              items={emailItems}
              onValueChange={(value) => {
                if (
                  value === "any" ||
                  value === "with" ||
                  value === "without"
                ) {
                  field.onChange(value);
                }
              }}
              value={field.value}
            >
              <SelectTrigger className="w-full" id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emailItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          control={form.control}
          label="Min. members"
          name="minMembers"
          placeholder="0"
        />
        <NumberField
          control={form.control}
          label="Max. members"
          name="maxMembers"
          placeholder="Any"
        />
        <NumberField
          control={form.control}
          description="Estimated monthly revenue, in dollars."
          label="Min. MRR ($)"
          name="minMrr"
          placeholder="0"
        />
        <NumberField
          control={form.control}
          label="Max. MRR ($)"
          name="maxMrr"
          placeholder="Any"
        />
      </div>
      <SheetFooter className="px-0">
        <Tip
          label="Show only communities matching these filters"
          render={<Button type="submit" />}
        >
          Apply filters
        </Tip>
        <Tip
          label="Remove these filters"
          render={<Button onClick={reset} type="button" variant="outline" />}
        >
          Reset
        </Tip>
      </SheetFooter>
    </form>
  );
};

export const CommunityFiltersSheet = ({
  filters,
  onApply,
}: CommunityFiltersSheetProps) => {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(filters).filter(
    (value) => value !== undefined,
  ).length;

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <Tip
        label="Filter by email, members and MRR"
        render={<SheetTrigger render={<Button variant="outline" />} />}
      >
        <SlidersHorizontalIcon />
        More filters
        {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
      </Tip>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>More filters</SheetTitle>
          <SheetDescription>
            Narrow the communities by email, size and revenue.
          </SheetDescription>
        </SheetHeader>
        <FiltersForm
          filters={filters}
          onApply={onApply}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
};
