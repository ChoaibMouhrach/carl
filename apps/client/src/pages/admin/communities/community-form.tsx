import { RequiredIndicator } from "@/components/required-indicator";
import { TextField } from "@/components/text-field";
import { Tip } from "@/components/tip";
import { formatCurrency } from "@/lib/format";
import { intervalOptions, type PriceInterval } from "@/lib/pricing";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components/ui/toggle-group";
import { Controller, useForm, useWatch } from "react-hook-form";
import z from "zod";
import { LeadPicker, type LeadOption } from "./lead-picker";

export interface CommunityFormValues {
  leadId: number;
  name: string;
  skoolUrl: string;
  description: string | null;
  members: number | null;
  mrr: number | null;
  email: string | null;
  isFree: boolean;
  priceCents: number | null;
  priceCurrency: string | null;
  priceInterval: PriceInterval | null;
}

interface CommunityFormProps {
  cancelAction: React.ReactNode;
  community?: CommunityFormValues;
  initialLead: LeadOption | null;
  isPending: boolean;
  leads: LeadOption[];
  onLeadSearch: (search: string) => void;
  onSubmit: (values: CommunityFormValues) => Promise<unknown>;
}

const wholeNumber = z
  .string()
  .trim()
  .regex(/^\d*$/, "Enter a whole number, or leave empty");

const schema = z.object({
  lead: z
    .object({
      leadId: z.number(),
      name: z.string(),
      username: z.string(),
      pictureUrl: z.string().nullish(),
    })
    .nullable()
    .refine((lead) => lead !== null, "Pick the owner of this community"),
  name: z.string().trim().min(1, "This field is required").max(255),
  skoolUrl: z
    .string()
    .trim()
    .min(1, "This field is required")
    .refine((value) => {
      try {
        const { hostname } = new URL(value);
        return hostname === "skool.com" || hostname.endsWith(".skool.com");
      } catch {
        return false;
      }
    }, "Enter a skool.com link, e.g. https://www.skool.com/my-community"),
  description: z.string().trim().max(5000),
  members: wholeNumber,
  mrr: wholeNumber,
  email: z
    .string()
    .trim()
    .max(255)
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address",
    ),
  pricing: z.enum(["free", "paid"]),
  amount: z.string().trim(),
  currency: z.string().trim(),
  interval: z.enum(["month", "year", "one_time"]),
});

type FormInput = z.input<typeof schema>;

const priceAmount = /^\d+(\.\d{1,2})?$/;

const emptyToNull = (value: string) => value.trim() || null;

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
      name: community?.name ?? "",
      skoolUrl: community?.skoolUrl ?? "",
      description: community?.description ?? "",
      members: community?.members?.toString() ?? "",
      mrr: community?.mrr?.toString() ?? "",
      email: community?.email ?? "",
      pricing: community?.isFree === false ? "paid" : "free",
      amount:
        community?.priceCents == null ? "" : String(community.priceCents / 100),
      currency: community?.priceCurrency?.toUpperCase() ?? "USD",
      interval: community?.priceInterval ?? "month",
    },
    resolver: zodResolver(schema),
  });

  const pricing = useWatch({ control: form.control, name: "pricing" });
  const members = useWatch({ control: form.control, name: "members" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const interval = useWatch({ control: form.control, name: "interval" });

  const estimate =
    pricing === "paid" &&
    members !== "" &&
    priceAmount.test(amount) &&
    interval !== "one_time"
      ? Math.round(
          Number(members) *
            (interval === "year" ? Number(amount) / 12 : Number(amount)),
        )
      : null;

  const submit = form.handleSubmit(async (input) => {
    if (input.pricing === "paid") {
      let invalid = false;

      if (!priceAmount.test(input.amount)) {
        form.setError("amount", {
          message: "Enter the price in dollars, e.g. 49 or 49.99",
        });
        invalid = true;
      }

      if (!/^[A-Za-z]{3}$/.test(input.currency)) {
        form.setError("currency", {
          message: "Use a 3-letter currency code, e.g. USD",
        });
        invalid = true;
      }

      if (invalid) return;
    }

    if (!input.lead) return;

    const paid = input.pricing === "paid";

    try {
      await onSubmit({
        leadId: input.lead.leadId,
        name: input.name,
        skoolUrl: input.skoolUrl,
        description: emptyToNull(input.description),
        members: input.members === "" ? null : Number(input.members),
        mrr: input.mrr === "" ? null : Number(input.mrr),
        email: emptyToNull(input.email),
        isFree: !paid,
        priceCents: paid ? Math.round(Number(input.amount) * 100) : null,
        priceCurrency: paid ? input.currency.toLowerCase() : null,
        priceInterval: paid ? input.interval : null,
      });
    } catch {
      return;
    }
  });

  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent>
          <div className="space-y-8">
            <FieldSet>
              <FieldLegend>Community</FieldLegend>
              <FieldDescription>
                What it is called and who runs it.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Controller
                    control={form.control}
                    name="lead"
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel htmlFor={field.name}>
                          Owner
                          <RequiredIndicator />
                        </FieldLabel>
                        <LeadPicker
                          id={field.name}
                          invalid={fieldState.invalid}
                          leads={leads}
                          onChange={field.onChange}
                          onSearch={onLeadSearch}
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
                  label="Name"
                  name="name"
                  placeholder="My Community"
                  required
                />
                <TextField
                  control={form.control}
                  inputMode="url"
                  label="Skool link"
                  name="skoolUrl"
                  placeholder="https://www.skool.com/my-community"
                  required
                />
                <TextField
                  control={form.control}
                  label="Description"
                  multiline
                  name="description"
                  placeholder="What the community is about"
                  wrapperClassName="sm:col-span-2"
                />
                <TextField
                  control={form.control}
                  description="Where to reach the community. Optional."
                  label="Contact email"
                  name="email"
                  placeholder="hello@example.com"
                  wrapperClassName="sm:col-span-2"
                />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Price</FieldLegend>
              <FieldDescription>What members pay to join.</FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="pricing"
                  render={({ field }) => (
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor={field.name}>
                        Membership
                        <RequiredIndicator />
                      </FieldLabel>
                      <ToggleGroup
                        aria-label="Membership"
                        className="w-fit"
                        id={field.name}
                        onValueChange={(next) => {
                          const value = next.at(0);
                          if (value === "free" || value === "paid") {
                            field.onChange(value);
                          }
                        }}
                        spacing={0}
                        value={[field.value]}
                        variant="outline"
                      >
                        <Tip
                          label="Anyone can join for free"
                          render={<ToggleGroupItem value="free" />}
                        >
                          Free
                        </Tip>
                        <Tip
                          label="Members pay to join"
                          render={<ToggleGroupItem value="paid" />}
                        >
                          Paid
                        </Tip>
                      </ToggleGroup>
                    </Field>
                  )}
                />
                {pricing === "paid" && (
                  <>
                    <TextField
                      control={form.control}
                      description="In dollars, e.g. 49 or 49.99."
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
                    <Controller
                      control={form.control}
                      name="interval"
                      render={({ field }) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Billed
                            <RequiredIndicator />
                          </FieldLabel>
                          <Select
                            items={intervalOptions}
                            onValueChange={(value) => {
                              const option = intervalOptions.find(
                                (item) => item.value === value,
                              );
                              if (option) field.onChange(option.value);
                            }}
                            value={field.value}
                          >
                            <SelectTrigger className="w-full" id={field.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {intervalOptions.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    />
                  </>
                )}
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Size and revenue</FieldLegend>
              <FieldDescription>
                Rough numbers are fine. Leave a field empty if you don't know.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  inputMode="numeric"
                  label="Members"
                  name="members"
                  placeholder="1200"
                />
                <div className="space-y-2">
                  <TextField
                    control={form.control}
                    description="Estimated monthly revenue, in dollars."
                    inputMode="numeric"
                    label="MRR"
                    name="mrr"
                    placeholder="5000"
                  />
                  {estimate !== null && (
                    <Tip
                      label="Fill MRR with members × price per month"
                      render={
                        <Button
                          onClick={() =>
                            form.setValue("mrr", String(estimate), {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          size="xs"
                          type="button"
                          variant="outline"
                        />
                      }
                    >
                      Use {formatCurrency(estimate, "USD")} (members × price)
                    </Tip>
                  )}
                </div>
              </div>
            </FieldSet>
          </div>
          <div className="mt-8 flex gap-2">
            <Tip
              label={isPending ? "Saving…" : "Save this community"}
              render={<Button disabled={isPending} type="submit" />}
            >
              {isPending && <Spinner />}
              Save community
            </Tip>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
