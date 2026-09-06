import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./auth";

export const oauthApplicationTable = pgTable("oauthApplication", {
  id: text().primaryKey(),
  name: text().notNull(),
  icon: text(),
  metadata: text(),
  clientId: text().notNull().unique(),
  clientSecret: text(),
  redirectUrls: text().notNull(),
  type: text().notNull(),
  disabled: boolean().notNull().default(false),
  userId: text().references(() => userTable.id, { onDelete: "cascade" }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const oauthAccessTokenTable = pgTable("oauthAccessToken", {
  id: text().primaryKey(),
  accessToken: text().notNull().unique(),
  refreshToken: text().notNull().unique(),
  accessTokenExpiresAt: timestamp().notNull(),
  refreshTokenExpiresAt: timestamp().notNull(),
  clientId: text().notNull(),
  userId: text().references(() => userTable.id, { onDelete: "cascade" }),
  scopes: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const oauthConsentTable = pgTable("oauthConsent", {
  id: text().primaryKey(),
  clientId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  scopes: text().notNull(),
  consentGiven: boolean().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export type OauthApplication = typeof oauthApplicationTable.$inferSelect;
export type OauthAccessToken = typeof oauthAccessTokenTable.$inferSelect;
export type OauthConsent = typeof oauthConsentTable.$inferSelect;
