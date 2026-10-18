import {
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
