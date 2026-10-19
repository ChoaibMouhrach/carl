import {
  BaseSkoolScraper,
  type SkoolAbout,
  type SkoolDiscoveryPage,
  type SkoolDiscoveryQuery,
  type SkoolOwner,
  type SkoolProfile,
} from "@server/lib/base-skool-scraper";
import { sleep } from "@server/lib/utils";
import type { z } from "zod";
import {
  aboutOwnerSchema,
  aboutSchema,
  BASE_URL,
  DISCOVERY_LANGUAGE,
  discoveryPageSchema,
  NEXT_DATA_MARKER,
  nextDataSchema,
  profileSchema,
  SkoolNoEnglishResultsError,
  SkoolRequestError,
  USER_AGENT,
} from "./constants";
import { emptyToNull, nanosecondsToDate, toDate, toPrice } from "./utils";

export class CustomSkoolScraper extends BaseSkoolScraper {
  private maxAttempts;
  private retryDelayMs;

  public constructor(
    init: { maxAttempts?: number; retryDelayMs?: number } = {},
  ) {
    super();
    this.maxAttempts = init.maxAttempts ?? 4;
    this.retryDelayMs = init.retryDelayMs ?? 1_000;
  }

  public override async discover(
    query: SkoolDiscoveryQuery,
  ): Promise<SkoolDiscoveryPage> {
    const params = new URLSearchParams({
      ty: query.visibility,
      q: query.keyword,
      lang: DISCOVERY_LANGUAGE,
      pr: query.price,
      p: String(query.page),
    });

    const pageProps = await this.fetchPageProps(`/discovery?${params}`).catch(
      (error) => {
        if (error instanceof SkoolNoEnglishResultsError) return null;
        throw error;
      },
    );

    if (!pageProps) return { totalGroups: 0, groups: [] };

    const data = discoveryPageSchema.parse(pageProps);

    return {
      totalGroups: data.numGroups,
      groups: data.groups.map(({ group }) => ({
        skoolId: group.id,
        name: group.name,
        displayName: group.metadata.displayName ?? group.name,
        description: emptyToNull(group.metadata.description),
        memberCount: group.metadata.totalMembers,
        createdAt: toDate(group.createdAt),
        updatedAt: toDate(group.updatedAt),
        isPublic: group.public ?? false,
        membershipModel: group.metadata.membershipModel ?? null,
        displayPrice: toPrice(group.metadata.displayPrice),
        monthlyPrice: toPrice(group.metadata.currentMBp),
        annualPrice: toPrice(group.metadata.currentABp),
        reviewCount: group.metadata.reviewCount ?? null,
        reviewRating: group.metadata.reviewAverageRating ?? null,
        logoUrl: emptyToNull(group.metadata.logoUrl),
        coverUrl: emptyToNull(group.metadata.coverSmallUrl),
      })),
    };
  }

  public override async about(communityName: string): Promise<SkoolAbout> {
    const pageProps = await this.fetchPageProps(`/${communityName}/about`);
    const { currentGroup: group, groupMembershipProducts } =
      aboutSchema.parse(pageProps);
    const metadata = group.metadata;

    return {
      skoolId: group.id,
      name: group.name,
      displayName: metadata.displayName ?? group.name,
      description: emptyToNull(metadata.description),
      longDescription: emptyToNull(metadata.lpDescription),
      memberCount: metadata.totalMembers,
      createdAt: toDate(group.createdAt),
      updatedAt: toDate(group.updatedAt),
      isPublic: group.public ?? false,
      membershipModel: metadata.membershipModel ?? null,
      plan: emptyToNull(metadata.plan),
      freeTrialEnabled: metadata.freeTrialEnabled === 1,
      logoUrl: emptyToNull(metadata.logoUrl),
      coverUrl: emptyToNull(metadata.coverSmallUrl),
      postCount: metadata.totalPosts ?? null,
      adminCount: metadata.totalAdmins ?? null,
      courseCount: metadata.numCourses ?? null,
      moduleCount: metadata.numModules ?? null,
      reviewCount: metadata.reviewCount ?? null,
      reviewRating: metadata.reviewAverageRating ?? null,
      affiliatePercent: metadata.aflPercent ?? null,
      freeBenefits: metadata.freeBenefits ?? [],
      links: metadata.links?.links ?? [],
      membershipQuestions:
        metadata.surveyEnabled === 1 ? (metadata.survey?.survey ?? []) : [],
      tiers: (groupMembershipProducts ?? []).map((product) => ({
        tier: product.tier ?? "",
        model: product.model ?? "",
        benefits: product.metadata.benefits ?? [],
        hasMonthly: Boolean(product.monthlyBpId),
        hasAnnual: Boolean(product.annualBpId),
        hasOneTime: Boolean(product.oneTimeBpId),
        active: !product.deactivatedAt,
      })),
      owner: metadata.owner ? this.toAboutOwner(metadata.owner) : null,
    };
  }

  public override async profile(username: string): Promise<SkoolProfile> {
    const pageProps = await this.fetchPageProps(`/@${username}`);
    const { currentUser: user } = profileSchema.parse(pageProps);
    const metadata = user.metadata;
    const { profileData } = user;

    return {
      owner: this.toOwner({
        skoolUserId: user.id,
        username: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        timeZone: user.timeZone,
        joinedAt: user.createdAt,
        bio: metadata.bio,
        location: metadata.location,
        pictureUrl: metadata.pictureProfile,
        lastOffline: metadata.lastOffline,
        website: metadata.linkWebsite,
        linkedinUrl: metadata.linkLinkedin,
        facebookUrl: metadata.linkFacebook,
        instagramUrl: metadata.linkInstagram,
        twitterUrl: metadata.linkTwitter,
        youtubeUrl: metadata.linkYoutube,
        tiktokUrl: metadata.linkTiktok,
      }),
      followerCount: profileData.totalFollowers ?? null,
      followingCount: profileData.totalFollowing ?? null,
      postCount: profileData.totalPosts ?? null,
      ownedCommunities: profileData.groupsCreatedByUser.map((group) => ({
        skoolId: group.id,
        name: group.name,
        displayName: group.metadata.displayName ?? group.name,
        url: `${BASE_URL}/${group.name}`,
        memberCount: group.metadata.totalMembers ?? null,
        isPaid: Boolean(
          group.metadata.displayPrice ||
          group.metadata.currentMBp ||
          group.metadata.currentABp,
        ),
      })),
    };
  }

  private toAboutOwner(owner: z.output<typeof aboutOwnerSchema>): SkoolOwner {
    const metadata = owner.metadata;

    return this.toOwner({
      skoolUserId: owner.id,
      username: owner.name,
      firstName: owner.first_name,
      lastName: owner.last_name,
      email: owner.email,
      timeZone: owner.time_zone,
      joinedAt: owner.created_at,
      bio: metadata.bio,
      location: metadata.location,
      pictureUrl: metadata.picture_profile,
      lastOffline: metadata.last_offline,
      website: metadata.link_website,
      linkedinUrl: metadata.link_linkedin,
      facebookUrl: metadata.link_facebook,
      instagramUrl: metadata.link_instagram,
      twitterUrl: metadata.link_twitter,
      youtubeUrl: metadata.link_youtube,
      tiktokUrl: metadata.link_tiktok,
    });
  }

  private toOwner(input: {
    skoolUserId: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    timeZone?: string;
    joinedAt?: string;
    bio?: string;
    location?: string;
    pictureUrl?: string;
    lastOffline?: number;
    website?: string;
    linkedinUrl?: string;
    facebookUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    youtubeUrl?: string;
    tiktokUrl?: string;
  }): SkoolOwner {
    const firstName = emptyToNull(input.firstName);
    const lastName = emptyToNull(input.lastName);

    return {
      skoolUserId: input.skoolUserId,
      username: input.username,
      name: [firstName, lastName].filter(Boolean).join(" ") || input.username,
      firstName,
      lastName,
      email: emptyToNull(input.email),
      bio: emptyToNull(input.bio),
      location: emptyToNull(input.location),
      timeZone: emptyToNull(input.timeZone),
      pictureUrl: emptyToNull(input.pictureUrl),
      joinedAt: toDate(input.joinedAt),
      lastOnlineAt: nanosecondsToDate(input.lastOffline),
      website: emptyToNull(input.website),
      linkedinUrl: emptyToNull(input.linkedinUrl),
      facebookUrl: emptyToNull(input.facebookUrl),
      instagramUrl: emptyToNull(input.instagramUrl),
      twitterUrl: emptyToNull(input.twitterUrl),
      youtubeUrl: emptyToNull(input.youtubeUrl),
      tiktokUrl: emptyToNull(input.tiktokUrl),
    };
  }

  private async fetchPageProps(path: string) {
    const html = await this.fetchHtml(path);
    const marker = html.indexOf(NEXT_DATA_MARKER);
    const start = html.indexOf(">", marker) + 1;
    const end = html.indexOf("</script>", start);

    return nextDataSchema.parse(JSON.parse(html.slice(start, end))).props
      .pageProps;
  }

  private async fetchHtml(path: string) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.fetchHtmlOnce(path);
      } catch (error) {
        const retryable =
          !(error instanceof SkoolRequestError) || error.retryable;

        if (!retryable || attempt >= this.maxAttempts) throw error;

        const backoff = this.retryDelayMs * 2 ** (attempt - 1);
        await sleep(backoff + Math.random() * backoff);
      }
    }
  }

  private async fetchHtmlOnce(path: string) {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { "user-agent": USER_AGENT },
      redirect: "manual",
    });

    if (response.status === 200) {
      const html = await response.text();

      // A 200 without page data is a challenge page, which a retry usually clears
      if (!html.includes(NEXT_DATA_MARKER)) {
        throw new SkoolRequestError(`__NEXT_DATA__ missing for ${path}`, true);
      }

      return html;
    }

    if (response.headers.get("location")?.includes("lang=all")) {
      throw new SkoolNoEnglishResultsError(path);
    }

    const retryable =
      [202, 429].includes(response.status) || response.status >= 500;

    throw new SkoolRequestError(
      `Skool answered ${response.status} for ${path}`,
      retryable,
    );
  }
}
