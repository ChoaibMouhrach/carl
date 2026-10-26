export const socialFields = [
  "instagram",
  "facebook",
  "linkedin",
  "website",
] as const;

export type SocialField = (typeof socialFields)[number];

export const socialLabels: Record<SocialField, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  website: "Website",
};

export const skoolProfileUrl = (username: string) =>
  `https://www.skool.com/@${username}`;
