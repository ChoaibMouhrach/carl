import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import {
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
import { useTranslation } from "react-i18next";
import z from "zod";

export interface CampaignFormValues {
  name: string;
  description: string | null;
  keyword: string;
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
  keyword: z.string().trim().min(1).max(255),
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
  const { t } = useTranslation();

  const form = useForm<FormInput>({
    defaultValues: {
      name: campaign?.name ?? "",
      description: campaign?.description ?? "",
      keyword: campaign?.keyword ?? "",
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
            message: t("campaignForm.rangeError"),
            path: ["maxMonthlyPriceUsd"],
          },
        )
        .refine(
          (input) =>
            input.minMembers === "" ||
            input.maxMembers === "" ||
            Number(input.minMembers) <= Number(input.maxMembers),
          { message: t("campaignForm.rangeError"), path: ["maxMembers"] },
        ),
    ),
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        name: input.name,
        description: input.description || null,
        keyword: input.keyword,
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
              label={t("campaignForm.name")}
              name="name"
              placeholder={t("campaignForm.namePlaceholder")}
              required
            />
            <TextField
              control={form.control}
              label={t("campaignForm.descriptionLabel")}
              multiline
              name="description"
              placeholder={t("campaignForm.descriptionPlaceholder")}
            />
            <TextField
              control={form.control}
              label={t("campaignForm.keyword")}
              name="keyword"
              placeholder={t("campaignForm.keywordPlaceholder")}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                label={t("campaignForm.types")}
                name="type"
                options={skoolVisibilities.map((value) => ({
                  value,
                  label: t(`campaignForm.visibility.${value}`),
                }))}
                placeholder={t("campaignForm.typesPlaceholder")}
                required
              />
              <SelectField
                control={form.control}
                label={t("campaignForm.pricingModels")}
                name="pricingModel"
                options={skoolPriceFilters.map((value) => ({
                  value,
                  label: t(`campaignForm.price.${value}`),
                }))}
                placeholder={t("campaignForm.pricingModelsPlaceholder")}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                inputMode="decimal"
                label={t("campaignForm.minMonthlyPrice")}
                name="minMonthlyPriceUsd"
                placeholder={t("campaignForm.minMonthlyPricePlaceholder")}
              />
              <TextField
                control={form.control}
                inputMode="decimal"
                label={t("campaignForm.maxMonthlyPrice")}
                name="maxMonthlyPriceUsd"
                placeholder={t("campaignForm.maxMonthlyPricePlaceholder")}
              />
              <TextField
                control={form.control}
                inputMode="numeric"
                label={t("campaignForm.minMembers")}
                name="minMembers"
                placeholder={t("campaignForm.minMembersPlaceholder")}
              />
              <TextField
                control={form.control}
                inputMode="numeric"
                label={t("campaignForm.maxMembers")}
                name="maxMembers"
                placeholder={t("campaignForm.maxMembersPlaceholder")}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              {t("campaignForm.save")}
            </Button>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
