import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { timestamps } from "../utils";

export const userTable = pgTable("user", {
  id: text().primaryKey(),

  // -- fields
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),

  // -- admin plugin
  role: text().notNull().default("user"),
  banned: boolean(),
  banReason: text(),
  banExpires: timestamp(),

  // -- timestamps
  ...timestamps(),
});

export const sessionTable = pgTable("session", {
  id: text().primaryKey(),

  // -- fields
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  ipAddress: text(),
  userAgent: text(),

  // -- admin plugin
  impersonatedBy: text(),

  // -- timestamps
  ...timestamps(),
});

export const accountTable = pgTable("account", {
  id: text().primaryKey(),

  // -- fields
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  idToken: text(),
  password: text(),

  // -- timestamps
  ...timestamps(),
});

export const verificationTable = pgTable("verification", {
  id: text().primaryKey(),

  // -- fields
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),

  // -- timestamps
  ...timestamps(),
});

export const passkeyTable = pgTable(
  "passkey",
  {
    id: text().primaryKey(),

    // -- fields
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    credentialID: text().notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    aaguid: text(),

    // -- timestamps
    createdAt: timestamp().defaultNow(),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

export const oauthApplicationTable = pgTable(
  "oauth_application",
  {
    id: text().primaryKey(),

    // -- fields
    name: text().notNull(),
    icon: text(),
    metadata: text(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    redirectUrls: text().notNull(),
    type: text().notNull(),
    disabled: boolean().default(false),
    userId: text().references(() => userTable.id, { onDelete: "cascade" }),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [index("oauth_application_userId_idx").on(table.userId)],
);

export const oauthAccessTokenTable = pgTable(
  "oauth_access_token",
  {
    id: text().primaryKey(),

    // -- fields
    accessToken: text().notNull().unique(),
    refreshToken: text().notNull().unique(),
    accessTokenExpiresAt: timestamp().notNull(),
    refreshTokenExpiresAt: timestamp().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthApplicationTable.clientId, {
        onDelete: "cascade",
      }),
    userId: text().references(() => userTable.id, { onDelete: "cascade" }),
    scopes: text().notNull(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_userId_idx").on(table.userId),
  ],
);

export const oauthConsentTable = pgTable(
  "oauth_consent",
  {
    id: text().primaryKey(),

    // -- fields
    clientId: text()
      .notNull()
      .references(() => oauthApplicationTable.clientId, {
        onDelete: "cascade",
      }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    scopes: text().notNull(),
    consentGiven: boolean(),

    // -- timestamps
    ...timestamps(),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ],
);

export type User = typeof userTable.$inferSelect;
export type Session = typeof sessionTable.$inferSelect;
export type OAuthApplication = typeof oauthApplicationTable.$inferSelect;
export const usersTable = userTable;
