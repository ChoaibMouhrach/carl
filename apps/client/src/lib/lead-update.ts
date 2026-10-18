import type { UpdateLeadInput } from "@/api/lead";
import type { LeadFormValues } from "@/pages/admin/leads/lead-form";

export const toLeadUpdate = (values: LeadFormValues): UpdateLeadInput => ({
  name: values.name,
  firstName: values.firstName,
  lastName: values.lastName,
  bio: values.bio,
  location: values.location,
  website: values.website,
  linkedinUrl: values.linkedinUrl,
  facebookUrl: values.facebookUrl,
  instagramUrl: values.instagramUrl,
  twitterUrl: values.twitterUrl,
  youtubeUrl: values.youtubeUrl,
});
