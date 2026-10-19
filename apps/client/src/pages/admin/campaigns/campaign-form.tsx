import { SelectField } from "@/components/select-field";
import { TagsField } from "@/components/tags-field";
import { TextField } from "@/components/text-field";
import {
  maxKeywords,
  skoolPriceFilters,
  skoolVisibilities,
  type SkoolPriceFilter,
  type SkoolVisibility,
} from "@/lib/campaign";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useForm } from "react-hook-form";
import z from "zod";

export interface CampaignFormValues {
  name: string;
  description: string | null;
  keywords: string[];
  types: SkoolVisibility[];
  pricingModels: SkoolPriceFilter[];
  minMonthlyPriceUsd: number | null;
  maxMonthlyPriceUsd: number | null;
  minMembers: number | null;
  maxMembers: number | null;
}

interface CampaignFormProps {
  campaign?: CampaignFormValues;
  cancelAction: React.ReactNode;
  isPending: boolean;
  onSubmit: (values: CampaignFormValues) => Promise<unknown>;
}

const optionalNumber = (integer: boolean) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (Number.isFinite(Number(value)) &&
          Number(value) >= 0 &&
          (!integer || Number.isInteger(Number(value)))),
    );

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000),
  keywords: z.array(z.string().trim().min(1).max(255)).min(1).max(maxKeywords),
  type: z.enum(skoolVisibilities),
  pricingModel: z.enum(skoolPriceFilters),
  minMonthlyPriceUsd: optionalNumber(false),
  maxMonthlyPriceUsd: optionalNumber(false),
  minMembers: optionalNumber(true),
  maxMembers: optionalNumber(true),
});

type FormInput = z.input<typeof schema>;

const toNumber = (value: string) => (value === "" ? null : Number(value));
const fromNumber = (value: number | null | undefined) =>
  value == null ? "" : String(value);

export const CampaignForm = ({
  campaign,
  cancelAction,
  isPending,
  onSubmit,
}: CampaignFormProps) => {
  const form = useForm<FormInput>({
    defaultValues: {
      name: campaign?.name ?? "",
      description: campaign?.description ?? "",
      keywords: campaign?.keywords ?? [],
      type: campaign?.types[0],
      pricingModel: campaign?.pricingModels[0],
      minMonthlyPriceUsd: fromNumber(campaign?.minMonthlyPriceUsd),
      maxMonthlyPriceUsd: fromNumber(campaign?.maxMonthlyPriceUsd),
      minMembers: fromNumber(campaign?.minMembers),
      maxMembers: fromNumber(campaign?.maxMembers),
    },
    resolver: zodResolver(
      schema
        .refine(
          (input) =>
            input.minMonthlyPriceUsd === "" ||
            input.maxMonthlyPriceUsd === "" ||
            Number(input.minMonthlyPriceUsd) <=
              Number(input.maxMonthlyPriceUsd),
          {
            message: "Minimum cannot be greater than maximum.",
            path: ["maxMonthlyPriceUsd"],
          },
        )
        .refine(
          (input) =>
            input.minMembers === "" ||
            input.maxMembers === "" ||
            Number(input.minMembers) <= Number(input.maxMembers),
          {
            message: "Minimum cannot be greater than maximum.",
            path: ["maxMembers"],
          },
        ),
    ),
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        name: input.name,
        description: input.description || null,
        keywords: input.keywords,
        types: [input.type],
        pricingModels: [input.pricingModel],
        minMonthlyPriceUsd: toNumber(input.minMonthlyPriceUsd),
        maxMonthlyPriceUsd: toNumber(input.maxMonthlyPriceUsd),
        minMembers: toNumber(input.minMembers),
        maxMembers: toNumber(input.maxMembers),
      });
    } catch {
      return;
    }
  });

  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent>
          <div className="grid gap-4">
            <TextField
              control={form.control}
              label="Name"
              name="name"
              placeholder="Fitness coaches, Q4"
              required
            />
            <TextField
              control={form.control}
              label="Description"
              multiline
              name="description"
              placeholder="Who this campaign targets and why."
            />
            <TagsField
              control={form.control}
              label="Search keywords"
              max={maxKeywords}
              name="keywords"
              placeholder="Type a keyword and press Enter"
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                label="Type"
                name="type"
                options={skoolVisibilities.map((value) => ({
                  value,
                  label: { public: "Public", private: "Private" }[value],
                }))}
                placeholder="Select a type"
                required
              />
              <SelectField
                control={form.control}
                label="Pricing model"
                name="pricingModel"
                options={skoolPriceFilters.map((value) => ({
                  value,
                  label: {
                    free: "Free",
                    paid: "Paid",
                    "free-trial": "Free trial",
                  }[value],
                }))}
                placeholder="Select a pricing model"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                inputMode="decimal"
                label="Min price per month ($)"
                name="minMonthlyPriceUsd"
                placeholder="No minimum"
              />
              <TextField
                control={form.control}
                inputMode="decimal"
                label="Max price per month ($)"
                name="maxMonthlyPriceUsd"
                placeholder="No maximum"
              />
              <TextField
                control={form.control}
                inputMode="numeric"
                label="Min members"
                name="minMembers"
                placeholder="No minimum"
              />
              <TextField
                control={form.control}
                inputMode="numeric"
                label="Max members"
                name="maxMembers"
                placeholder="No maximum"
              />
            </div>
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
