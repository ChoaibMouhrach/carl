import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { leadsTable } from "./leads";

export type CommunityPrice = {
  type: "free" | "paid";
  interval: "month" | "year" | "one_time" | null;
  /** Amount in cents */
  amount: number;
  currency: string | null;
};

export type MembershipQuestion = {
  question: string;
  type: string;
  options?: string[];
};

export type CommunityTier = {
  tier: string;
  model: string;
  benefits: string[];
  hasMonthly: boolean;
  hasAnnual: boolean;
  hasOneTime: boolean;
  active: boolean;
};

export type CommunityLink = {
  url: string;
  label: string;
};

export const communitiesTable = pgTable("communities", {
  communityId: id(),

  // -- owner
  leadId: integer()
    .notNull()
    .references(() => leadsTable.leadId, { onDelete: "cascade" }),

  // -- skool
  skoolId: text().notNull().unique(),
  name: text().notNull(),
  displayName: text().notNull(),
  communityUrl: text().notNull(),
  description: text(),
  longDescription: text(),
  memberCount: integer().notNull(),
  skoolCreatedAt: timestamp(),
  recentActivity: timestamp(),
  membershipQuestions: jsonb()
    .$type<MembershipQuestion[]>()
    .notNull()
    .default([]),

  accessType: text().$type<"public" | "private">(),
  /** Skool's internal membership model: 1 free, 2 paid, 3 freemium, 4 tiers, 5 one-time */
  membershipModel: integer(),
  plan: text(),
  freeTrialEnabled: boolean().notNull().default(false),
  logoUrl: text(),
  coverUrl: text(),
  freeBenefits: jsonb().$type<string[]>().notNull().default([]),
  tiers: jsonb().$type<CommunityTier[]>().notNull().default([]),
  links: jsonb().$type<CommunityLink[]>().notNull().default([]),

  // -- activity
  postCount: integer(),
  adminCount: integer(),
  courseCount: integer(),
  moduleCount: integer(),
  reviewCount: integer(),
  reviewRating: doublePrecision(),
  affiliatePercent: integer(),

  // -- discovery
  discoveryKeyword: text(),
  discoverySearch: text(),

  // -- pricing
  pricingType: text().$type<CommunityPrice["type"]>().notNull(),
  pricingInterval: text().$type<CommunityPrice["interval"]>(),
  /** Cents */
  priceAmount: integer().notNull().default(0),
  priceCurrency: text(),
  prices: jsonb().$type<CommunityPrice[]>().notNull().default([]),
  monthlyPriceUsd: doublePrecision(),
  /** Monthly price × members: an overestimate, only for ranking */
  estMonthlyRevenue: doublePrecision(),

  // -- ai filter
  salesMotionQuote: text(),

  // -- timestamps
  ...timestamps(),
});

export type CommunitiesTable = typeof communitiesTable;
export type Community = CommunitiesTable["$inferSelect"];
export type CommunityInsert = CommunitiesTable["$inferInsert"];
