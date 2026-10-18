import z from "zod";
import { jsonString } from "./utils";

export const BASE_URL = "https://www.skool.com";
export const DISCOVERY_LANGUAGE = "english";
// Skool answers 202 with a bot challenge when requests carry an `accept` header, so only a user-agent is sent
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const NEXT_DATA_MARKER = 'id="__NEXT_DATA__"';

const text = z.string().optional().catch(undefined);
const count = z.number().optional().catch(undefined);

const price = jsonString(
  z.object({
    currency: z.string().default("usd"),
    amount: z.number(),
    recurring_interval: z
      .enum(["month", "year", "one_time"])
      .optional()
      .catch(undefined),
  }),
);

const rating = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    const parsed = Number(value);
    return value === undefined || Number.isNaN(parsed) ? undefined : parsed;
  })
  .catch(undefined);

const strings = jsonString(z.array(z.string()));

export const nextDataSchema = z.object({
  props: z.object({ pageProps: z.record(z.string(), z.unknown()) }),
});

export const discoveryPageSchema = z.object({
  numGroups: z.number().default(0),
  groups: z
    .array(
      z.object({
        group: z.object({
          id: z.string(),
          name: z.string(),
          createdAt: z.string().nullish(),
          updatedAt: z.string().nullish(),
          public: z.boolean().optional().catch(undefined),
          metadata: z.object({
            displayName: text,
            description: z.string().nullish().catch(undefined),
            totalMembers: z.number().default(0),
            membershipModel: count,
            displayPrice: price,
            currentMBp: price,
            currentABp: price,
            reviewCount: count,
            reviewAverageRating: rating,
            logoUrl: text,
            coverSmallUrl: text,
          }),
        }),
      }),
    )
    .default([]),
});

const links = z
  .object({
    link_website: text,
    link_linkedin: text,
    link_facebook: text,
    link_instagram: text,
    link_twitter: text,
    link_youtube: text,
    link_tiktok: text,
  })
  .partial();

const timestamp = z.number().optional().catch(undefined);

export const aboutOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  first_name: text,
  last_name: text,
  email: text,
  time_zone: text,
  created_at: text,
  metadata: links
    .extend({
      bio: text,
      location: text,
      picture_profile: text,
      last_offline: timestamp,
    })
    .default({}),
});

export const profileUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstName: text,
  lastName: text,
  email: text,
  timeZone: text,
  createdAt: text,
  metadata: z
    .object({
      bio: text,
      location: text,
      pictureProfile: text,
      lastOffline: timestamp,
      linkWebsite: text,
      linkLinkedin: text,
      linkFacebook: text,
      linkInstagram: text,
      linkTwitter: text,
      linkYoutube: text,
      linkTiktok: text,
    })
    .default({}),
  profileData: z
    .object({
      totalPosts: count,
      totalFollowers: count,
      totalFollowing: count,
      groupsCreatedByUser: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            metadata: z.object({
              displayName: text,
              totalMembers: count,
              membershipModel: count,
              displayPrice: price,
              currentMBp: price,
              currentABp: price,
            }),
          }),
        )
        .nullish()
        .transform((groups) => groups ?? []),
    })
    .default({ groupsCreatedByUser: [] }),
});

export const aboutSchema = z.object({
  currentGroup: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string().nullish(),
    updatedAt: z.string().nullish(),
    public: z.boolean().optional().catch(undefined),
    metadata: z.object({
      displayName: text,
      description: z.string().nullish().catch(undefined),
      lpDescription: z.string().nullish().catch(undefined),
      totalMembers: z.number().default(0),
      membershipModel: count,
      plan: text,
      freeTrialEnabled: count,
      logoUrl: text,
      coverSmallUrl: text,
      totalPosts: count,
      totalAdmins: count,
      numCourses: count,
      numModules: count,
      reviewCount: count,
      reviewAverageRating: rating,
      aflPercent: count,
      freeBenefits: strings,
      links: jsonString(
        z.object({
          links: z.array(
            z.object({ url: z.string(), label: z.string().default("") }),
          ),
        }),
      ),
      owner: jsonString(aboutOwnerSchema),
      surveyEnabled: count,
      survey: jsonString(
        z.object({
          survey: z
            .array(
              z.object({
                question: z.string(),
                type: z.string(),
                options: z.array(z.string()).optional(),
              }),
            )
            .default([]),
        }),
      ),
    }),
  }),
  groupMembershipProducts: z
    .array(
      z.object({
        tier: text,
        model: text,
        monthlyBpId: text,
        annualBpId: text,
        oneTimeBpId: text,
        deactivatedAt: text,
        metadata: z.object({ benefits: strings }).default({ benefits: null }),
      }),
    )
    .nullish()
    .catch(undefined),
});

export const profileSchema = z.object({
  currentUser: profileUserSchema,
});

export type DiscoveryPageData = z.output<typeof discoveryPageSchema>;
export type AboutData = z.output<typeof aboutSchema>;

export class SkoolRequestError extends Error {
  public readonly retryable: boolean;

  public constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}
