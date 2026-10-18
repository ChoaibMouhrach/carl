import type {
  CommunityLink,
  CommunityTier,
  MembershipQuestion,
  OwnedCommunity,
} from "@server/infrastructure/database/schemas";

export const skoolVisibilities = ["public", "private"] as const;

export type SkoolVisibility = (typeof skoolVisibilities)[number];

export const skoolPriceFilters = ["free", "paid", "free-trial"] as const;

export type SkoolPriceFilter = (typeof skoolPriceFilters)[number];

export interface SkoolDiscoveryQuery {
  keyword: string;
  visibility: SkoolVisibility;
  price: SkoolPriceFilter;
  page: number;
}

export interface SkoolPrice {
  currency: string;
  /** Cents */
  amount: number;
  interval: "month" | "year" | "one_time" | null;
}

export interface SkoolDiscoveryGroup {
  skoolId: string;
  name: string;
  displayName: string;
  description: string | null;
  memberCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  isPublic: boolean;
  membershipModel: number | null;
  displayPrice: SkoolPrice | null;
  monthlyPrice: SkoolPrice | null;
  annualPrice: SkoolPrice | null;
  reviewCount: number | null;
  reviewRating: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
}

export interface SkoolDiscoveryPage {
  totalGroups: number;
  groups: SkoolDiscoveryGroup[];
}

export interface SkoolOwner {
  skoolUserId: string;
  username: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  bio: string | null;
  location: string | null;
  timeZone: string | null;
  pictureUrl: string | null;
  joinedAt: Date | null;
  lastOnlineAt: Date | null;
  website: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
}

export interface SkoolAbout {
  skoolId: string;
  name: string;
  displayName: string;
  description: string | null;
  longDescription: string | null;
  memberCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  isPublic: boolean;
  membershipModel: number | null;
  plan: string | null;
  freeTrialEnabled: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  postCount: number | null;
  adminCount: number | null;
  courseCount: number | null;
  moduleCount: number | null;
  reviewCount: number | null;
  reviewRating: number | null;
  affiliatePercent: number | null;
  freeBenefits: string[];
  links: CommunityLink[];
  membershipQuestions: MembershipQuestion[];
  tiers: CommunityTier[];
  owner: SkoolOwner | null;
}

export interface SkoolProfile {
  owner: SkoolOwner;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  ownedCommunities: OwnedCommunity[];
}

export abstract class BaseSkoolScraper {
  /** Skool discovery, always restricted to English communities */
  public abstract discover(
    query: SkoolDiscoveryQuery,
  ): Promise<SkoolDiscoveryPage>;

  public abstract about(communityName: string): Promise<SkoolAbout>;

  public abstract profile(username: string): Promise<SkoolProfile>;
}
