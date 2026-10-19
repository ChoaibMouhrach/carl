import type {
  SkoolPriceFilter,
  SkoolVisibility,
} from "@repo/constants/campaign";
import {
  SKOOL_LOOKUP_CACHE_TTL_SECONDS,
  SKOOL_LOOKUP_MAX_RESULTS,
} from "@server/config/constants";
import { BaseService } from "@server/lib/base-service";
import type { SkoolAbout, SkoolProfile } from "@server/lib/base-skool-scraper";
import { derivePricing } from "@server/lib/pricing";
import { classifyGroup } from "@server/lib/skool-discovery";
import { matchesFilters } from "@server/lib/skool-filters";
import { extractEmails } from "@server/lib/utils";

const SKOOL_URL = "https://www.skool.com";

interface SearchInput {
  keyword: string;
  visibility: SkoolVisibility;
  price: SkoolPriceFilter;
  page: number;
  minMembers?: number;
  maxMembers?: number;
  minMonthlyPriceUsd?: number;
  maxMonthlyPriceUsd?: number;
}

export interface SkoolCommunitySummary {
  name: string;
  displayName: string;
  url: string;
  description: string | null;
  memberCount: number;
  accessType: SkoolVisibility;
  pricingType: string;
  pricingInterval: string | null;
  priceAmount: number;
  priceCurrency: string | null;
  monthlyPriceUsd: number | null;
  estMonthlyRevenueUsd: number | null;
  freeTrialEnabled: boolean;
  reviewCount: number | null;
  reviewRating: number | null;
}

interface SearchPage {
  totalGroups: number;
  communities: SkoolCommunitySummary[];
}

const toOwner = (owner: NonNullable<SkoolAbout["owner"]>) => ({
  username: owner.username,
  name: owner.name,
  bio: owner.bio,
  location: owner.location,
  emails: extractEmails(owner.bio, owner.email),
  website: owner.website,
  linkedinUrl: owner.linkedinUrl,
  facebookUrl: owner.facebookUrl,
  instagramUrl: owner.instagramUrl,
  twitterUrl: owner.twitterUrl,
  youtubeUrl: owner.youtubeUrl,
  tiktokUrl: owner.tiktokUrl,
});

const toCommunityDetail = (about: SkoolAbout) => ({
  name: about.name,
  displayName: about.displayName,
  url: `${SKOOL_URL}/${about.name}`,
  description: about.description,
  longDescription: about.longDescription,
  memberCount: about.memberCount,
  isPublic: about.isPublic,
  plan: about.plan,
  freeTrialEnabled: about.freeTrialEnabled,
  createdAt: about.createdAt?.toISOString() ?? null,
  postCount: about.postCount,
  courseCount: about.courseCount,
  reviewCount: about.reviewCount,
  reviewRating: about.reviewRating,
  affiliatePercent: about.affiliatePercent,
  freeBenefits: about.freeBenefits,
  links: about.links,
  membershipQuestions: about.membershipQuestions,
  tiers: about.tiers,
  owner: about.owner ? toOwner(about.owner) : null,
});

const toProfile = (profile: SkoolProfile) => ({
  ...toOwner(profile.owner),
  followerCount: profile.followerCount,
  followingCount: profile.followingCount,
  postCount: profile.postCount,
  ownedCommunities: profile.ownedCommunities,
});

export type SkoolCommunityDetail = ReturnType<typeof toCommunityDetail>;
export type SkoolOwnerProfile = ReturnType<typeof toProfile>;

/** Looks Skool up on demand and stores nothing in the database */
export class SkoolLookupService extends BaseService {
  public async searchCommunities(input: SearchInput) {
    const keyword = input.keyword.trim();
    const page = await this.remember<SearchPage>(
      [
        "search",
        input.visibility,
        input.price,
        input.page,
        keyword.toLowerCase(),
      ],
      async () => {
        const discovered = await this.context.skoolScraper.discover({
          keyword,
          visibility: input.visibility,
          price: input.price,
          page: input.page,
        });

        const communities = discovered.groups.map((group) => {
          const classified = classifyGroup(
            { visibility: input.visibility, price: input.price },
            group,
            keyword,
          );
          const pricing = derivePricing(classified.prices, group.memberCount);

          return {
            name: group.name,
            displayName: group.displayName,
            url: `${SKOOL_URL}/${group.name}`,
            description: group.description,
            memberCount: group.memberCount,
            accessType: classified.accessType,
            pricingType: pricing.pricingType,
            pricingInterval: pricing.pricingInterval,
            priceAmount: pricing.priceAmount / 100,
            priceCurrency: pricing.priceCurrency,
            monthlyPriceUsd: pricing.monthlyPriceUsd,
            estMonthlyRevenueUsd: pricing.estMonthlyRevenue,
            freeTrialEnabled: classified.freeTrialEnabled,
            reviewCount: group.reviewCount,
            reviewRating: group.reviewRating,
          };
        });

        return { totalGroups: discovered.totalGroups, communities };
      },
    );

    const matching = page.communities.filter((community) =>
      matchesFilters(
        {
          minMembers: input.minMembers,
          maxMembers: input.maxMembers,
          minMonthlyPriceUsd: input.minMonthlyPriceUsd,
          maxMonthlyPriceUsd: input.maxMonthlyPriceUsd,
        },
        community,
      ),
    );

    return {
      page: input.page,
      totalGroups: page.totalGroups,
      returned: Math.min(matching.length, SKOOL_LOOKUP_MAX_RESULTS),
      communities: matching.slice(0, SKOOL_LOOKUP_MAX_RESULTS),
    };
  }

  public async getCommunity(name: string) {
    return await this.remember<SkoolCommunityDetail>(
      ["community", name.trim().toLowerCase()],
      async () => {
        const about = await this.context.skoolScraper.about(name.trim());
        return toCommunityDetail(about);
      },
    );
  }

  public async getOwner(username: string) {
    return await this.remember<SkoolOwnerProfile>(
      ["owner", username.trim().toLowerCase()],
      async () => {
        const profile = await this.context.skoolScraper.profile(
          username.trim(),
        );
        return toProfile(profile);
      },
    );
  }

  private async remember<Value>(
    parts: (string | number)[],
    load: () => Promise<Value>,
  ): Promise<Value> {
    const key = `skool-lookup:${parts.join(":")}`;
    const cached = await this.context.cache.get(key);

    if (cached !== null) {
      try {
        return JSON.parse(cached);
      } catch {
        // A damaged entry is a miss; the fresh answer overwrites it
      }
    }

    const value = await load();
    await this.context.cache.set(
      key,
      JSON.stringify(value),
      SKOOL_LOOKUP_CACHE_TTL_SECONDS,
    );

    return value;
  }
}
