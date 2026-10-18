import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";

export type OwnedCommunity = {
  skoolId: string;
  name: string;
  displayName: string;
  url: string;
  memberCount: number | null;
  isPaid: boolean;
};

export const leadsTable = pgTable("leads", {
  leadId: id(),

  // -- identity
  skoolUserId: text().unique(),
  skoolUsername: text().notNull().unique(),
  name: text().notNull(),
  firstName: text(),
  lastName: text(),

  // -- profile
  bio: text(),
  location: text(),
  timeZone: text(),
  pictureUrl: text(),
  skoolJoinedAt: timestamp(),
  lastOnlineAt: timestamp(),
  followerCount: integer(),
  followingCount: integer(),
  postCount: integer(),

  // -- contact
  /** Emails found in the bio and the Skool email field */
  emails: jsonb().$type<string[]>().notNull().default([]),

  // -- online presence
  website: text(),
  linkedinUrl: text(),
  facebookUrl: text(),
  instagramUrl: text(),
  twitterUrl: text(),
  youtubeUrl: text(),
  tiktokUrl: text(),

  /** Communities listed on the owner's profile page */
  ownedCommunities: jsonb().$type<OwnedCommunity[]>().notNull().default([]),
  profileScrapedAt: timestamp(),

  // -- timestamps
  ...timestamps(),
});

export type LeadsTable = typeof leadsTable;
export type Lead = LeadsTable["$inferSelect"];
export type LeadInsert = LeadsTable["$inferInsert"];
