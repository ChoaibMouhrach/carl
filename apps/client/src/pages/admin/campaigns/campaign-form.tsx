import { TextField } from "@/components/text-field";
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
}

interface CampaignFormProps {
  campaign?: CampaignFormValues;
  cancelAction: React.ReactNode;
  isPending: boolean;
  onSubmit: (values: CampaignFormValues) => Promise<unknown>;
}

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000),
});

type FormInput = z.input<typeof schema>;

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
    },
    resolver: zodResolver(schema),
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        name: input.name,
        description: input.description || null,
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
