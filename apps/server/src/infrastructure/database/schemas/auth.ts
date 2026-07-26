import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
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

export type User = typeof userTable.$inferSelect;
export type Session = typeof sessionTable.$inferSelect;
export const usersTable = userTable;
