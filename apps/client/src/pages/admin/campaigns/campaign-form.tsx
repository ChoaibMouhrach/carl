import { TextField } from "@/components/text-field";
import { Tip } from "@/components/tip";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/ui/field";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useForm } from "react-hook-form";
import z from "zod";

export interface CampaignFormValues {
  name: string;
  description: string | null;
  keyword: string;
  minPriceCents: number | null;
  minMembers: number | null;
}

interface CampaignFormProps {
  cancelAction: React.ReactNode;
  /** Present when editing: it fills the form and switches it to edit mode */
  campaign?: CampaignFormValues;
  isPending: boolean;
  onSubmit: (values: CampaignFormValues) => Promise<unknown>;
}

const schema = z.object({
  name: z.string().trim().min(1, "This field is required").max(255),
  description: z.string().trim().max(500, "Keep it under 500 characters"),
  keyword: z.string().trim().min(1, "This field is required").max(255),
  minPrice: z
    .string()
    .trim()
    .regex(
      /^(\d+(\.\d{1,2})?)?$/,
      "Enter the price in dollars, e.g. 49 or 49.99, or leave empty",
    ),
  minMembers: z
    .string()
    .trim()
    .regex(/^\d*$/, "Enter a whole number, e.g. 100, or leave empty"),
});

type FormInput = z.input<typeof schema>;

export const CampaignForm = ({
  cancelAction,
  campaign,
  isPending,
  onSubmit,
}: CampaignFormProps) => {
  const isEditing = campaign !== undefined;

  const form = useForm<FormInput>({
    defaultValues: {
      name: campaign?.name ?? "",
      description: campaign?.description ?? "",
      keyword: campaign?.keyword ?? "",
      minPrice:
        campaign?.minPriceCents == null
          ? ""
          : String(campaign.minPriceCents / 100),
      minMembers: campaign?.minMembers?.toString() ?? "",
    },
    resolver: zodResolver(schema),
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        name: input.name,
        description: input.description || null,
        keyword: input.keyword,
        minPriceCents:
          input.minPrice === ""
            ? null
            : Math.round(Number(input.minPrice) * 100),
        minMembers: input.minMembers === "" ? null : Number(input.minMembers),
      });
    } catch {
      return;
    }
  });

  const isSaveDisabled = isPending || (isEditing && !form.formState.isDirty);

  const saveLabel = isEditing ? "Save changes" : "Create campaign";

  const saveTip = isPending
    ? "Saving…"
    : isSaveDisabled
      ? "Change something to save"
      : isEditing
        ? "Save your changes to this campaign"
        : "Create this campaign";

  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent>
          <div className="space-y-8">
            <FieldSet>
              <FieldLegend>About</FieldLegend>
              <FieldDescription>
                What this campaign is called and who it is for.
              </FieldDescription>
              <div className="grid gap-4">
                <TextField
                  control={form.control}
                  label="Name"
                  name="name"
                  placeholder="Fitness coaches"
                  required
                />
                <TextField
                  control={form.control}
                  description="Optional. A sentence or two, up to 500 characters."
                  label="Description"
                  multiline
                  name="description"
                  placeholder="Paid fitness communities with an active audience"
                />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Targeting</FieldLegend>
              <FieldDescription>
                The search and the floor a community must clear to be a fit.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  description="What Skool is searched for."
                  label="Search keyword"
                  name="keyword"
                  placeholder="fitness coaching"
                  required
                  wrapperClassName="sm:col-span-2"
                />
                <TextField
                  control={form.control}
                  description="Optional. USD per month. Leave empty for no minimum."
                  inputMode="decimal"
                  label="Minimum price"
                  name="minPrice"
                  placeholder="49"
                />
                <TextField
                  control={form.control}
                  description="Optional. Leave empty for no minimum."
                  inputMode="numeric"
                  label="Minimum members"
                  name="minMembers"
                  placeholder="100"
                />
              </div>
            </FieldSet>
          </div>
          <div className="mt-8 flex gap-2">
            <Tip
              label={saveTip}
              render={<Button disabled={isSaveDisabled} type="submit" />}
            >
              {isPending && <Spinner />}
              {saveLabel}
            </Tip>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
