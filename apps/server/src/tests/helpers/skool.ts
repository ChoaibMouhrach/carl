import {
  BaseSkoolScraper,
  type SkoolAbout,
  type SkoolDiscoveryGroup,
  type SkoolDiscoveryPage,
  type SkoolDiscoveryQuery,
  type SkoolOwner,
  type SkoolProfile,
} from "@server/lib/base-skool-scraper";

export const group = (
  name: string,
  overrides: Partial<SkoolDiscoveryGroup> = {},
): SkoolDiscoveryGroup => ({
  skoolId: `id-${name}`,
  name,
  displayName: name,
  description: null,
  memberCount: 100,
  createdAt: null,
  updatedAt: null,
  isPublic: true,
  membershipModel: null,
  displayPrice: null,
  monthlyPrice: null,
  annualPrice: null,
  reviewCount: null,
  reviewRating: null,
  logoUrl: null,
  coverUrl: null,
  ...overrides,
});

export const owner = (
  username: string,
  bio: string | null = null,
): SkoolOwner => ({
  skoolUserId: `user-${username}`,
  username,
  name: username,
  firstName: null,
  lastName: null,
  email: null,
  bio,
  location: null,
  timeZone: null,
  pictureUrl: null,
  joinedAt: new Date("2024-01-01T00:00:00Z"),
  lastOnlineAt: null,
  website: null,
  linkedinUrl: null,
  facebookUrl: null,
  instagramUrl: "https://instagram.com/jane",
  twitterUrl: null,
  youtubeUrl: null,
  tiktokUrl: null,
});

const about = (
  name: string,
  communityOwner: SkoolOwner | null,
  memberCount: number,
): SkoolAbout => ({
  skoolId: `id-${name}`,
  name,
  displayName: name,
  description: "desc",
  longDescription: "long desc",
  memberCount,
  createdAt: null,
  updatedAt: null,
  isPublic: true,
  membershipModel: 4,
  plan: "pro",
  freeTrialEnabled: false,
  logoUrl: null,
  coverUrl: null,
  postCount: 10,
  adminCount: 1,
  courseCount: 2,
  moduleCount: 3,
  reviewCount: null,
  reviewRating: null,
  affiliatePercent: 40,
  freeBenefits: [],
  links: [],
  membershipQuestions: [],
  tiers: [],
  owner: communityOwner,
});

export class FakeSkoolScraper extends BaseSkoolScraper {
  public aboutCalls: string[] = [];
  public profileCalls: string[] = [];
  public failingProfiles = new Set<string>();
  public discoverError: Error | null = null;
  public memberCounts: Record<string, number> = {};
  public byKeyword: Record<string, Record<string, SkoolDiscoveryGroup[]>> = {};
  public ownerless = new Set<string>();
  public failingAbout = new Set<string>();
  public profileBios: Record<string, string> = {};
  public totals: Record<string, number> = {};
  public laterPages: Record<string, SkoolDiscoveryGroup[]> = {};
  public failingPages = new Set<number>();
  public discoverCalls: string[] = [];

  public constructor(
    public pages: Record<string, SkoolDiscoveryGroup[]>,
    private owners: Record<string, SkoolOwner>,
  ) {
    super();
  }

  public override async discover(
    query: SkoolDiscoveryQuery,
  ): Promise<SkoolDiscoveryPage> {
    if (this.discoverError) throw this.discoverError;
    const key = `${query.visibility}-${query.price}`;
    this.discoverCalls.push(`${query.keyword}/${key}/${query.page}`);

    if (query.page > 1) {
      if (this.failingPages.has(query.page)) {
        throw new Error(`page ${query.page} failed`);
      }

      return {
        totalGroups: this.totals[key] ?? 0,
        groups: query.page === 2 ? (this.laterPages[key] ?? []) : [],
      };
    }

    const source = this.byKeyword[query.keyword] ?? this.pages;
    const groups = source[key] ?? [];
    return { totalGroups: this.totals[key] ?? groups.length, groups };
  }

  public override async about(communityName: string): Promise<SkoolAbout> {
    this.aboutCalls.push(communityName);
    if (this.failingAbout.has(communityName)) throw new Error("about failed");

    const communityOwner = this.ownerless.has(communityName)
      ? null
      : this.owners[communityName];
    if (communityOwner === undefined) {
      throw new Error(`no owner for ${communityName}`);
    }
    return about(
      communityName,
      communityOwner,
      this.memberCounts[communityName] ?? 120,
    );
  }

  public override async profile(username: string): Promise<SkoolProfile> {
    this.profileCalls.push(username);
    if (this.failingProfiles.has(username)) throw new Error("profile failed");
    return {
      owner: owner(
        username,
        this.profileBios[username] ??
          "Reach me at Jane.Doe@Example.com or @jane",
      ),
      followerCount: 12,
      followingCount: 3,
      postCount: 40,
      ownedCommunities: [],
    };
  }
}

export const paidMonthly = {
  currency: "usd",
  amount: 2900,
  interval: "month" as const,
};
