import { CustomInput } from "@/components/custom-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/ui/field";
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

export type PricingType = "free" | "paid";
export type SortBy = "estMonthlyRevenue" | "memberCount" | "createdAt" | "name";
export type SortOrder = "asc" | "desc";

export interface CommunityFilterValues {
  minMembers?: number;
  minRevenue?: number;
  pricingType?: PricingType;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
}

interface CommunityFiltersSheetProps {
  filters: CommunityFilterValues;
  onApply: (filters: CommunityFilterValues) => void;
}

const schema = z.object({
  pricingType: z.enum(["all", "free", "paid"]),
  minMembers: z.string().trim().regex(/^\d*$/),
  minRevenue: z
    .string()
    .trim()
    .regex(/^\d*(\.\d+)?$/),
  sortBy: z.enum(["estMonthlyRevenue", "memberCount", "createdAt", "name"]),
  sortOrder: z.enum(["asc", "desc"]),
});

type FormInput = z.input<typeof schema>;

const defaultSortBy: SortBy = "estMonthlyRevenue";
const defaultSortOrder: SortOrder = "desc";

const FiltersForm = ({
  filters,
  onApply,
  onDone,
}: CommunityFiltersSheetProps & { onDone: () => void }) => {
  const form = useForm<FormInput>({
    defaultValues: {
      pricingType: filters.pricingType ?? "all",
      minMembers: filters.minMembers?.toString() ?? "",
      minRevenue: filters.minRevenue?.toString() ?? "",
      sortBy: filters.sortBy ?? defaultSortBy,
      sortOrder: filters.sortOrder ?? defaultSortOrder,
    },
    resolver: zodResolver(schema),
  });

  const pricingItems = [
    { value: "all", label: "Any pricing" },
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ];

  const sortByItems: { value: SortBy; label: string }[] = [
    { value: "estMonthlyRevenue", label: "Est. revenue" },
    { value: "memberCount", label: "Members" },
    { value: "createdAt", label: "Date added" },
    { value: "name", label: "Name" },
  ];

  const sortOrderItems: { value: SortOrder; label: string }[] = [
    { value: "desc", label: "Descending" },
    { value: "asc", label: "Ascending" },
  ];

  const submit = form.handleSubmit((input) => {
    onApply({
      pricingType: input.pricingType === "all" ? undefined : input.pricingType,
      minMembers:
        input.minMembers === "" ? undefined : Number(input.minMembers),
      minRevenue:
        input.minRevenue === "" ? undefined : Number(input.minRevenue),
      sortBy: input.sortBy === defaultSortBy ? undefined : input.sortBy,
      sortOrder:
        input.sortOrder === defaultSortOrder ? undefined : input.sortOrder,
    });
    onDone();
  });

  const reset = () => {
    // Explicit undefined, because merging an empty object would keep the old params
    onApply({
      pricingType: undefined,
      minMembers: undefined,
      minRevenue: undefined,
      sortBy: undefined,
      sortOrder: undefined,
    });
    onDone();
  };

  return (
    <form className="flex flex-1 flex-col gap-4 px-4" onSubmit={submit}>
      <Controller
        control={form.control}
        name="pricingType"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Pricing</FieldLabel>
            <Select
              items={pricingItems}
              onValueChange={(value) => {
                if (value === "all" || value === "free" || value === "paid") {
                  field.onChange(value);
                }
              }}
              value={field.value}
            >
              <SelectTrigger id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pricingItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="minMembers"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Min. members</FieldLabel>
            <CustomInput
              {...field}
              id={field.name}
              inputMode="numeric"
              placeholder="0"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="minRevenue"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Min. revenue ($/mo)</FieldLabel>
            <CustomInput
              {...field}
              id={field.name}
              inputMode="decimal"
              placeholder="0"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="sortBy"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Sort by</FieldLabel>
            <Select
              items={sortByItems}
              onValueChange={(value) => {
                const item = sortByItems.find(
                  (option) => option.value === value,
                );
                if (item) field.onChange(item.value);
              }}
              value={field.value}
            >
              <SelectTrigger id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortByItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="sortOrder"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Order</FieldLabel>
            <Select
              items={sortOrderItems}
              onValueChange={(value) => {
                const item = sortOrderItems.find(
                  (option) => option.value === value,
                );
                if (item) field.onChange(item.value);
              }}
              value={field.value}
            >
              <SelectTrigger id={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOrderItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <SheetFooter className="px-0">
        <Button type="submit">Apply</Button>
        <Button onClick={reset} type="button" variant="outline">
          Reset
        </Button>
      </SheetFooter>
    </form>
  );
};

export const CommunityFiltersSheet = ({
  filters,
  onApply,
}: CommunityFiltersSheetProps) => {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.pricingType,
    filters.minMembers,
    filters.minRevenue,
    filters.sortBy,
    filters.sortOrder,
  ].filter((value) => value !== undefined).length;

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger render={<Button variant="outline" />}>
        <SlidersHorizontalIcon />
        Filters
        {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Narrow down and sort the communities.
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
