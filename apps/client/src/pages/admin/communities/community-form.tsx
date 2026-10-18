import { RequiredIndicator } from "@/components/required-indicator";
import { TextField } from "@/components/text-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";
import { LeadPicker, type LeadOption } from "./lead-picker";

type Interval = "month" | "year" | "one_time";

export type CommunityPriceValue =
  | { type: "free" }
  | { type: "paid"; interval: Interval; amount: number; currency: string };

export interface CommunityFormValues {
  leadId: number;
  skoolId: string;
  name: string;
  displayName: string;
  communityUrl: string;
  description: string | null;
  memberCount: number;
  price: CommunityPriceValue;
}

export interface CommunityFormSource {
  skoolId: string;
  name: string;
  displayName: string;
  communityUrl: string;
  description: string | null;
  memberCount: number;
  pricingType: "free" | "paid";
  pricingInterval: Interval | null;
  priceAmount: number;
  priceCurrency: string | null;
}

interface CommunityFormProps {
  cancelAction: React.ReactNode;
  community?: CommunityFormSource;
  initialLead: LeadOption | null;
  isPending: boolean;
  leads: LeadOption[];
  onLeadSearch: (search: string) => void;
  onSubmit: (values: CommunityFormValues) => Promise<unknown>;
}

const schema = z.object({
  lead: z
    .object({
      leadId: z.number(),
      name: z.string(),
      skoolUsername: z.string(),
    })
    .nullable(),
  skoolId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  communityUrl: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(2000),
  memberCount: z.string().trim().min(1),
  priceType: z.enum(["free", "paid"]),
  interval: z.enum(["month", "year", "one_time"]),
  amount: z.string().trim(),
  currency: z.string().trim(),
});

type FormInput = z.input<typeof schema>;

export const CommunityForm = ({
  cancelAction,
  community,
  initialLead,
  isPending,
  leads,
  onLeadSearch,
  onSubmit,
}: CommunityFormProps) => {
  const { t } = useTranslation();

  const form = useForm<FormInput>({
    defaultValues: {
      lead: initialLead,
      skoolId: community?.skoolId ?? "",
      name: community?.name ?? "",
      displayName: community?.displayName ?? "",
      communityUrl: community?.communityUrl ?? "",
      description: community?.description ?? "",
      memberCount: community ? String(community.memberCount) : "",
      priceType: community?.pricingType ?? "free",
      interval: community?.pricingInterval ?? "month",
      amount: community ? String(community.priceAmount / 100) : "",
      currency: community?.priceCurrency ?? "USD",
    },
    resolver: zodResolver(schema),
  });

  const priceTypeItems = [
    { value: "free", label: t("communityForm.free") },
    { value: "paid", label: t("communityForm.paid") },
  ];

  const intervalItems = [
    { value: "month", label: t("communityForm.month") },
    { value: "year", label: t("communityForm.year") },
    { value: "one_time", label: t("communityForm.oneTime") },
  ];

  const priceType = useWatch({ control: form.control, name: "priceType" });

  const submit = form.handleSubmit(async (input) => {
    let hasError = false;

    if (!input.lead) {
      form.setError("lead", { message: t("communityForm.leadRequired") });
      hasError = true;
    }

    if (!z.url().safeParse(input.communityUrl).success) {
      form.setError("communityUrl", { message: t("communityForm.invalidUrl") });
      hasError = true;
    }

    if (!/^\d+$/.test(input.memberCount)) {
      form.setError("memberCount", {
        message: t("communityForm.invalidNumber"),
      });
      hasError = true;
    }

    if (input.priceType === "paid") {
      if (!/^\d+(\.\d{1,2})?$/.test(input.amount)) {
        form.setError("amount", { message: t("communityForm.invalidAmount") });
        hasError = true;
      }

      if (!/^[A-Za-z]{3}$/.test(input.currency)) {
        form.setError("currency", {
          message: t("communityForm.invalidCurrency"),
        });
        hasError = true;
      }
    }

    if (hasError || !input.lead) return;

    const price: CommunityPriceValue =
      input.priceType === "free"
        ? { type: "free" }
        : {
            type: "paid",
            interval: input.interval,
            amount: Math.round(Number(input.amount) * 100),
            currency: input.currency.toUpperCase(),
          };

    try {
      await onSubmit({
        leadId: input.lead.leadId,
        skoolId: input.skoolId,
        name: input.name,
        displayName: input.displayName,
        communityUrl: input.communityUrl,
        description: input.description || null,
        memberCount: Number(input.memberCount),
        price,
      });
    } catch {
      return;
    }
  });

  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="lead"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      {t("communityForm.lead")}
                      <RequiredIndicator />
                    </FieldLabel>
                    <LeadPicker
                      emptyLabel={t("communityForm.noLeads")}
                      id={field.name}
                      leads={leads}
                      onChange={field.onChange}
                      onSearch={onLeadSearch}
                      placeholder={t("communityForm.leadPlaceholder")}
                      value={field.value}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <TextField
              control={form.control}
              disabled={Boolean(community)}
              label={t("communityForm.skoolId")}
              name="skoolId"
              placeholder={t("communityForm.skoolIdPlaceholder")}
              required
            />
            <TextField
              control={form.control}
              label={t("communityForm.name")}
              name="name"
              placeholder={t("communityForm.namePlaceholder")}
              required
            />
            <TextField
              control={form.control}
              label={t("communityForm.displayName")}
              name="displayName"
              placeholder={t("communityForm.displayNamePlaceholder")}
              required
            />
            <TextField
              control={form.control}
              inputMode="url"
              label={t("communityForm.communityUrl")}
              name="communityUrl"
              placeholder={t("communityForm.urlPlaceholder")}
              required
            />
            <TextField
              control={form.control}
              inputMode="numeric"
              label={t("communityForm.memberCount")}
              name="memberCount"
              placeholder={t("communityForm.memberCountPlaceholder")}
              required
            />
            <Controller
              control={form.control}
              name="priceType"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    {t("communityForm.priceType")}
                    <RequiredIndicator />
                  </FieldLabel>
                  <Select
                    items={priceTypeItems}
                    onValueChange={(value) => {
                      if (value === "free" || value === "paid") {
                        field.onChange(value);
                      }
                    }}
                    value={field.value}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priceTypeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            {priceType === "paid" && (
              <>
                <Controller
                  control={form.control}
                  name="interval"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        {t("communityForm.interval")}
                        <RequiredIndicator />
                      </FieldLabel>
                      <Select
                        items={intervalItems}
                        onValueChange={(value) => {
                          if (
                            value === "month" ||
                            value === "year" ||
                            value === "one_time"
                          ) {
                            field.onChange(value);
                          }
                        }}
                        value={field.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {intervalItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <TextField
                  control={form.control}
                  inputMode="decimal"
                  label={t("communityForm.amount")}
                  name="amount"
                  placeholder={t("communityForm.amountPlaceholder")}
                  required
                />
                <TextField
                  control={form.control}
                  label={t("communityForm.currency")}
                  name="currency"
                  placeholder={t("communityForm.currencyPlaceholder")}
                  required
                />
              </>
            )}
            <TextField
              control={form.control}
              label={t("communityForm.descriptionLabel")}
              multiline
              name="description"
              placeholder={t("communityForm.descriptionPlaceholder")}
              wrapperClassName="sm:col-span-2"
            />
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              {t("communityForm.save")}
            </Button>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
