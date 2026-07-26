import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { userTable } from "./auth";

export const billingCustomersTable = pgTable("billingCustomers", {
  billingCustomerId: id(),
  userId: text()
    .notNull()
    .unique()
    .references(() => userTable.id, { onDelete: "cascade" }),
  provider: text().notNull(),
  providerCustomerId: text().notNull().unique(),
  ...timestamps(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  subscriptionId: id(),
  billingCustomerId: integer()
    .notNull()
    .references(() => billingCustomersTable.billingCustomerId, {
      onDelete: "cascade",
    }),
  provider: text().notNull(),
  providerSubscriptionId: text().notNull().unique(),
  providerPriceId: text(),
  planKey: text().notNull(),
  billingInterval: text().notNull(),
  scheduledBillingInterval: text(),
  scheduledPlanKey: text(),
  status: text().notNull(),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  currentPeriodStart: timestamp(),
  currentPeriodEnd: timestamp(),
  pastDueAt: timestamp(),
  endedAt: timestamp(),
  ...timestamps(),
});

export const billingEventsTable = pgTable("billingEvents", {
  billingEventId: id(),
  provider: text().notNull(),
  providerEventId: text().notNull().unique(),
  type: text().notNull(),
  payload: jsonb().notNull(),
  processedAt: timestamp(),
  ...timestamps(),
});

export const checkoutAttemptsTable = pgTable("checkoutAttempts", {
  checkoutAttemptId: id(),
  userId: text()
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  provider: text().notNull(),
  providerCheckoutSessionId: text().unique(),
  planKey: text().notNull(),
  billingInterval: text().notNull(),
  expiresAt: timestamp().notNull(),
  completedAt: timestamp(),
  ...timestamps(),
});
