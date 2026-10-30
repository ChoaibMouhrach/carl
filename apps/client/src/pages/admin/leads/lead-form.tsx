import { TextField } from "@/components/text-field";
import { Tip } from "@/components/tip";
import { skoolProfileUrl, socialFields, socialLabels } from "@/lib/lead";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/ui/field";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import z from "zod";

export interface LeadFormValues {
  name: string;
  username: string;
  skoolUrl: string;
  emails: string[];
  bio: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  website: string | null;
}

interface LeadFormProps {
  cancelAction: React.ReactNode;
  isPending: boolean;
  lead?: Omit<LeadFormValues, "emails">;
  onSubmit: (values: LeadFormValues) => Promise<unknown>;
}

const required = z.string().trim().min(1, "This field is required").max(255);

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value === "" || z.url().safeParse(value).success,
    "Enter a valid link, e.g. https://example.com",
  );

const schema = z.object({
  name: required,
  username: required,
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
    }, "Enter a skool.com link, e.g. https://www.skool.com/@jane"),
  email: z
    .string()
    .trim()
    .max(255)
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address",
    ),
  bio: z.string().trim().max(5000),
  instagram: optionalUrl,
  facebook: optionalUrl,
  linkedin: optionalUrl,
  website: optionalUrl,
});

type FormInput = z.input<typeof schema>;

const emptyToNull = (value: string) => value.trim() || null;

const socialPlaceholders = {
  instagram: "https://instagram.com/jane",
  facebook: "https://facebook.com/jane",
  linkedin: "https://linkedin.com/in/jane",
  website: "https://example.com",
} as const;

export const LeadForm = ({
  cancelAction,
  isPending,
  lead,
  onSubmit,
}: LeadFormProps) => {
  const form = useForm<FormInput>({
    defaultValues: {
      name: lead?.name ?? "",
      username: lead?.username ?? "",
      skoolUrl: lead?.skoolUrl ?? "",
      email: "",
      bio: lead?.bio ?? "",
      instagram: lead?.instagram ?? "",
      facebook: lead?.facebook ?? "",
      linkedin: lead?.linkedin ?? "",
      website: lead?.website ?? "",
    },
    resolver: zodResolver(schema),
  });

  const username = useWatch({ control: form.control, name: "username" });
  const skoolUrlEdited = Boolean(form.formState.dirtyFields.skoolUrl);

  // On a new lead, typing the username fills the Skool link until it is edited by hand
  useEffect(() => {
    if (lead || skoolUrlEdited) return;

    const trimmed = username.trim();
    form.setValue("skoolUrl", trimmed ? skoolProfileUrl(trimmed) : "");
  }, [form, lead, skoolUrlEdited, username]);

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        name: input.name,
        username: input.username,
        skoolUrl: input.skoolUrl,
        emails: input.email.trim() ? [input.email.trim()] : [],
        bio: emptyToNull(input.bio),
        instagram: emptyToNull(input.instagram),
        facebook: emptyToNull(input.facebook),
        linkedin: emptyToNull(input.linkedin),
        website: emptyToNull(input.website),
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
              <FieldLegend>Profile</FieldLegend>
              <FieldDescription>Who the owner is on Skool.</FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  label="Name"
                  name="name"
                  placeholder="Jane Doe"
                  required
                />
                <TextField
                  control={form.control}
                  description="The part after @ in their Skool profile link."
                  label="Username"
                  name="username"
                  placeholder="jane-doe"
                  required
                />
                <TextField
                  control={form.control}
                  inputMode="url"
                  label="Skool profile link"
                  name="skoolUrl"
                  placeholder="https://www.skool.com/@jane-doe"
                  required
                  wrapperClassName="sm:col-span-2"
                />
                <TextField
                  control={form.control}
                  label="Bio"
                  multiline
                  name="bio"
                  placeholder="A few words about the owner"
                  wrapperClassName="sm:col-span-2"
                />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Contact</FieldLegend>
              <FieldDescription>
                Where to reach them. Everything here is optional.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  label="Add email"
                  name="email"
                  placeholder="jane@example.com"
                  wrapperClassName="sm:col-span-2"
                />
                {socialFields.map((field) => (
                  <TextField
                    control={form.control}
                    inputMode="url"
                    key={field}
                    label={socialLabels[field]}
                    name={field}
                    placeholder={socialPlaceholders[field]}
                  />
                ))}
              </div>
            </FieldSet>
          </div>
          <div className="mt-8 flex gap-2">
            <Tip
              label={isPending ? "Saving…" : "Save this lead"}
              render={<Button disabled={isPending} type="submit" />}
            >
              {isPending && <Spinner />}
              Save lead
            </Tip>
            {cancelAction}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
