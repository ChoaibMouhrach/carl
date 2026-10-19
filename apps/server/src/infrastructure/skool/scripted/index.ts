import IORedis from "ioredis";
import {
  BaseSkoolScraper,
  type SkoolAbout,
  type SkoolDiscoveryGroup,
  type SkoolDiscoveryPage,
  type SkoolDiscoveryQuery,
  type SkoolOwner,
  type SkoolProfile,
} from "@server/lib/base-skool-scraper";
import type z from "zod";
import {
  scriptedCommunitySchema,
  scriptedProfileSchema,
  scriptKeys,
  skoolScriptSchema,
  type ScriptedCommunity,
  type ScriptedOwner,
} from "./script";

interface ScriptedScraperInit {
  fallback: BaseSkoolScraper;
  redisUrl: string;
}

const toOwner = (owner: ScriptedOwner): SkoolOwner => ({
  skoolUserId: `scripted-${owner.username}`,
  username: owner.username,
  name: owner.name ?? owner.username,
  firstName: null,
  lastName: null,
  email: owner.email ?? null,
  bio: owner.bio ?? null,
  location: null,
  timeZone: null,
  pictureUrl: null,
  joinedAt: new Date("2024-01-01T00:00:00Z"),
  lastOnlineAt: null,
  website: owner.website ?? null,
  linkedinUrl: owner.linkedinUrl ?? null,
  facebookUrl: null,
  instagramUrl: null,
  twitterUrl: null,
  youtubeUrl: null,
  tiktokUrl: null,
});

const toPrice = (community: ScriptedCommunity) =>
  community.price
    ? {
        currency: "usd",
        amount: community.price.amount,
        interval: community.price.interval,
      }
    : null;

const toGroup = (community: ScriptedCommunity): SkoolDiscoveryGroup => ({
  skoolId: `scripted-${community.name}`,
  name: community.name,
  displayName: community.displayName ?? community.name,
  description: null,
  memberCount: community.memberCount,
  createdAt: null,
  updatedAt: null,
  isPublic: true,
  membershipModel: null,
  displayPrice: toPrice(community),
  monthlyPrice: null,
  annualPrice: null,
  reviewCount: null,
  reviewRating: null,
  logoUrl: null,
  coverUrl: null,
});

/** Serves communities a test scripted into Redis and leaves everything else to the real scraper */
export class ScriptedSkoolScraper extends BaseSkoolScraper {
  private fallback: BaseSkoolScraper;
  private redis: IORedis;

  public constructor(init: ScriptedScraperInit) {
    super();
    this.fallback = init.fallback;
    this.redis = new IORedis(init.redisUrl);
  }

  public override async discover(
    query: SkoolDiscoveryQuery,
  ): Promise<SkoolDiscoveryPage> {
    const script = await this.read(
      scriptKeys.keywordKey(query.keyword),
      skoolScriptSchema,
    );

    if (!script) return await this.fallback.discover(query);
    if (script.failDiscovery) throw new Error(script.failDiscovery);

    const communities =
      query.page === 1
        ? (script.searches[`${query.visibility}-${query.price}`] ?? [])
        : [];

    return {
      totalGroups: communities.length,
      groups: communities.map(toGroup),
    };
  }

  public override async about(communityName: string): Promise<SkoolAbout> {
    const community = await this.read(
      scriptKeys.communityKey(communityName),
      scriptedCommunitySchema,
    );

    if (!community) return await this.fallback.about(communityName);
    if (community.failAbout) throw new Error("Scripted about failure");

    return {
      skoolId: `scripted-${community.name}`,
      name: community.name,
      displayName: community.displayName ?? community.name,
      description: "Scripted community",
      longDescription: null,
      memberCount: community.memberCount,
      createdAt: null,
      updatedAt: null,
      isPublic: true,
      membershipModel: null,
      plan: null,
      freeTrialEnabled: false,
      logoUrl: null,
      coverUrl: null,
      postCount: null,
      adminCount: null,
      courseCount: null,
      moduleCount: null,
      reviewCount: null,
      reviewRating: null,
      affiliatePercent: null,
      freeBenefits: [],
      links: [],
      membershipQuestions: [],
      tiers: [],
      owner: community.owner ? toOwner(community.owner) : null,
    };
  }

  public override async profile(username: string): Promise<SkoolProfile> {
    const scripted = await this.read(
      scriptKeys.ownerKey(username),
      scriptedProfileSchema,
    );

    if (!scripted) return await this.fallback.profile(username);
    if (scripted.fail) throw new Error("Scripted profile failure");

    return {
      owner: toOwner(scripted.owner),
      followerCount: 10,
      followingCount: 5,
      postCount: 20,
      ownedCommunities: [],
    };
  }

  private async read<Schema extends z.ZodType>(
    key: string,
    schema: Schema,
  ): Promise<z.output<Schema> | null> {
    const raw = await this.redis.get(key);

    return raw === null ? null : schema.parse(JSON.parse(raw));
  }
}
