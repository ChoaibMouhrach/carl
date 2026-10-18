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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
    { value: "all", label: t("adminCommunities.allPricing") },
    { value: "free", label: t("adminCommunities.free") },
    { value: "paid", label: t("adminCommunities.paid") },
  ];

  const sortByItems: { value: SortBy; label: string }[] = [
    { value: "estMonthlyRevenue", label: t("adminCommunities.sortRevenue") },
    { value: "memberCount", label: t("adminCommunities.sortMembers") },
    { value: "createdAt", label: t("adminCommunities.sortCreatedAt") },
    { value: "name", label: t("adminCommunities.sortName") },
  ];

  const sortOrderItems: { value: SortOrder; label: string }[] = [
    { value: "desc", label: t("adminCommunities.descending") },
    { value: "asc", label: t("adminCommunities.ascending") },
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
    onApply({});
    onDone();
  };

  return (
    <form className="flex flex-1 flex-col gap-4 px-4" onSubmit={submit}>
      <Controller
        control={form.control}
        name="pricingType"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>
              {t("adminCommunities.pricingFilter")}
            </FieldLabel>
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
            <FieldLabel htmlFor={field.name}>
              {t("adminCommunities.minMembers")}
            </FieldLabel>
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
            <FieldLabel htmlFor={field.name}>
              {t("adminCommunities.minRevenue")}
            </FieldLabel>
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
            <FieldLabel htmlFor={field.name}>
              {t("adminCommunities.sortBy")}
            </FieldLabel>
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
            <FieldLabel htmlFor={field.name}>
              {t("adminCommunities.sortOrder")}
            </FieldLabel>
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
        <Button type="submit">{t("adminCommunities.apply")}</Button>
        <Button onClick={reset} type="button" variant="outline">
          {t("adminCommunities.reset")}
        </Button>
      </SheetFooter>
    </form>
  );
};

export const CommunityFiltersSheet = ({
  filters,
  onApply,
}: CommunityFiltersSheetProps) => {
  const { t } = useTranslation();
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
        {t("adminCommunities.filters")}
        {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("adminCommunities.filtersTitle")}</SheetTitle>
          <SheetDescription>
            {t("adminCommunities.filtersDescription")}
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
