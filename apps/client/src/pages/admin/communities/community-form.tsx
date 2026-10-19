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
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ];

  const intervalItems = [
    { value: "month", label: "Monthly" },
    { value: "year", label: "Yearly" },
    { value: "one_time", label: "One-time" },
  ];

  const priceType = useWatch({ control: form.control, name: "priceType" });

  const submit = form.handleSubmit(async (input) => {
    let hasError = false;

    if (!input.lead) {
      form.setError("lead", { message: "Select a lead." });
      hasError = true;
    }

    if (!z.url().safeParse(input.communityUrl).success) {
      form.setError("communityUrl", { message: "Enter a valid URL." });
      hasError = true;
    }

    if (!/^\d+$/.test(input.memberCount)) {
      form.setError("memberCount", {
        message: "Enter a whole number.",
      });
      hasError = true;
    }

    if (input.priceType === "paid") {
      if (!/^\d+(\.\d{1,2})?$/.test(input.amount)) {
        form.setError("amount", { message: "Enter a valid price." });
        hasError = true;
      }

      if (!/^[A-Za-z]{3}$/.test(input.currency)) {
        form.setError("currency", {
          message: "Use a 3-letter currency code.",
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
                      Lead
                      <RequiredIndicator />
                    </FieldLabel>
                    <LeadPicker
                      emptyLabel="No leads found."
                      id={field.name}
                      leads={leads}
                      onChange={field.onChange}
                      onSearch={onLeadSearch}
                      placeholder="Search leads by name or username"
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
              label="Skool ID"
              name="skoolId"
              placeholder="0123abcd..."
              required
            />
            <TextField
              control={form.control}
              label="Slug"
              name="name"
              placeholder="my-community"
              required
            />
            <TextField
              control={form.control}
              label="Display name"
              name="displayName"
              placeholder="My Community"
              required
            />
            <TextField
              control={form.control}
              inputMode="url"
              label="Community URL"
              name="communityUrl"
              placeholder="https://www.skool.com/my-community"
              required
            />
            <TextField
              control={form.control}
              inputMode="numeric"
              label="Members"
              name="memberCount"
              placeholder="1200"
              required
            />
            <Controller
              control={form.control}
              name="priceType"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    Pricing
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
                        Billing interval
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
                  label="Price"
                  name="amount"
                  placeholder="49"
                  required
                />
                <TextField
                  control={form.control}
                  label="Currency"
                  name="currency"
                  placeholder="USD"
                  required
                />
              </>
            )}
            <TextField
              control={form.control}
              label="Description"
              multiline
              name="description"
              placeholder="What the community is about"
              wrapperClassName="sm:col-span-2"
            />
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              Save
            </Button>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
