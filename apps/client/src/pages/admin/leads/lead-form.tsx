import { TextField } from "@/components/text-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import z from "zod";

export interface LeadFormValues {
  skoolUsername: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  youtubeUrl: string | null;
}

interface LeadFormProps {
  cancelAction: React.ReactNode;
  isPending: boolean;
  lead?: LeadFormValues;
  onSubmit: (values: LeadFormValues) => Promise<unknown>;
}

const emptyToNull = (value: string) => value.trim() || null;

const schema = z.object({
  skoolUsername: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  firstName: z.string().trim().max(255),
  lastName: z.string().trim().max(255),
  bio: z.string().trim().max(5000),
  location: z.string().trim().max(255),
  website: z.string().trim().max(2048),
  linkedinUrl: z.string().trim().max(2048),
  facebookUrl: z.string().trim().max(2048),
  instagramUrl: z.string().trim().max(2048),
  twitterUrl: z.string().trim().max(2048),
  youtubeUrl: z.string().trim().max(2048),
});

type FormInput = z.input<typeof schema>;

const urlFields = [
  "website",
  "linkedinUrl",
  "facebookUrl",
  "instagramUrl",
  "twitterUrl",
  "youtubeUrl",
] as const;

export const LeadForm = ({
  cancelAction,
  isPending,
  lead,
  onSubmit,
}: LeadFormProps) => {
  const { t } = useTranslation();

  const form = useForm<FormInput>({
    defaultValues: {
      skoolUsername: lead?.skoolUsername ?? "",
      name: lead?.name ?? "",
      firstName: lead?.firstName ?? "",
      lastName: lead?.lastName ?? "",
      bio: lead?.bio ?? "",
      location: lead?.location ?? "",
      website: lead?.website ?? "",
      linkedinUrl: lead?.linkedinUrl ?? "",
      facebookUrl: lead?.facebookUrl ?? "",
      instagramUrl: lead?.instagramUrl ?? "",
      twitterUrl: lead?.twitterUrl ?? "",
      youtubeUrl: lead?.youtubeUrl ?? "",
    },
    resolver: zodResolver(schema),
  });

  const submit = form.handleSubmit(async (input) => {
    const invalidUrlField = urlFields.find(
      (field) =>
        input[field] !== "" && !z.url().safeParse(input[field]).success,
    );

    if (invalidUrlField) {
      form.setError(invalidUrlField, { message: t("leadForm.invalidUrl") });
      return;
    }

    try {
      await onSubmit({
        skoolUsername: input.skoolUsername,
        name: input.name,
        firstName: emptyToNull(input.firstName),
        lastName: emptyToNull(input.lastName),
        bio: emptyToNull(input.bio),
        location: emptyToNull(input.location),
        website: emptyToNull(input.website),
        linkedinUrl: emptyToNull(input.linkedinUrl),
        facebookUrl: emptyToNull(input.facebookUrl),
        instagramUrl: emptyToNull(input.instagramUrl),
        twitterUrl: emptyToNull(input.twitterUrl),
        youtubeUrl: emptyToNull(input.youtubeUrl),
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
            <TextField
              control={form.control}
              disabled={Boolean(lead)}
              label={t("leadForm.skoolUsername")}
              name="skoolUsername"
              placeholder={t("leadForm.usernamePlaceholder")}
              required
            />
            <TextField
              control={form.control}
              label={t("leadForm.name")}
              name="name"
              placeholder={t("leadForm.namePlaceholder")}
              required
            />
            <TextField
              control={form.control}
              label={t("leadForm.firstName")}
              name="firstName"
              placeholder={t("leadForm.firstNamePlaceholder")}
            />
            <TextField
              control={form.control}
              label={t("leadForm.lastName")}
              name="lastName"
              placeholder={t("leadForm.lastNamePlaceholder")}
            />
            <TextField
              control={form.control}
              label={t("leadForm.location")}
              name="location"
              placeholder={t("leadForm.locationPlaceholder")}
            />
            {urlFields.map((field) => (
              <TextField
                control={form.control}
                inputMode="url"
                key={field}
                label={t(`leadForm.${field}`)}
                name={field}
                placeholder={t("leadForm.urlPlaceholder")}
              />
            ))}
            <TextField
              control={form.control}
              label={t("leadForm.bio")}
              multiline
              name="bio"
              placeholder={t("leadForm.bioPlaceholder")}
              wrapperClassName="sm:col-span-2"
            />
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              {t("leadForm.save")}
            </Button>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
