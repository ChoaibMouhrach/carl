import { and, asc, desc, eq, like } from "drizzle-orm";
import { hashPassword, makeSignature, signJWT } from "better-auth/crypto";
import IORedis from "ioredis";
import { initDB, type DB } from "../infrastructure/database/client";
import {
  accountTable,
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
  scrapeRunsTable,
  sessionTable,
  userTable,
  verificationTable,
  type Campaign,
  type CampaignInsert,
  type Community,
  type Lead,
  type LeadInsert,
  type ScrapeRun,
} from "../infrastructure/database/schemas";
import {
  clearSkoolScript,
  writeSkoolScript,
  type SkoolScript,
} from "../infrastructure/skool/scripted/script";

const RESET_PASSWORD_PREFIX = "reset-password:";

const withDb = async <T>(
  config: SeedConfig,
  run: (db: DB) => Promise<T>,
): Promise<T> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    return await run(connection.db);
  } finally {
    await connection.pool.end();
  }
};

const requireUserId = async (db: DB, email: string): Promise<string> => {
  const [user] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (!user) {
    throw new Error(`no user for ${email}`);
  }

  return user.id;
};

const jsonHeaders = (config: SeedConfig): Record<string, string> => ({
  "Content-Type": "application/json",
  Origin: config.webOrigin,
});

export interface SeedConfig {
  apiUrl: string;
  authSecret: string;
  databaseUrl: string;
  redisUrl: string;
  webOrigin: string;
}

export interface CreateVerifiedUserInput {
  email: string;
  password: string;
  name?: string;
}

export interface SeededUser {
  userId: string;
  email: string;
  password: string;
}

export interface SeededSessionCookie {
  name: string;
  value: string;
}

export const ensureE2EPlatformSetup = async (
  config: SeedConfig,
): Promise<void> => {
  const checkResponse = await fetch(`${config.apiUrl}/api/platform-setup`);

  if (!checkResponse.ok) {
    throw new Error(`setup check failed (${checkResponse.status})`);
  }

  const check: unknown = await checkResponse.json();

  if (
    typeof check === "object" &&
    check !== null &&
    "setupDone" in check &&
    check.setupDone === true
  ) {
    return;
  }

  const suffix = crypto.randomUUID();
  const setupResponse = await fetch(`${config.apiUrl}/api/platform-setup`, {
    method: "POST",
    headers: jsonHeaders(config),
    body: JSON.stringify({
      email: `e2e-admin-${suffix}@example.com`,
      name: "E2E Administrator",
      password: `E2E-${suffix}@Aa1`,
    }),
  });

  if (!setupResponse.ok) {
    const body = await setupResponse.text();
    throw new Error(`platform setup failed (${setupResponse.status}): ${body}`);
  }
};

export const resetE2EAuthRateLimits = async (
  config: SeedConfig,
): Promise<void> => {
  const redis = new IORedis(config.redisUrl);

  try {
    const patterns = [
      "rate-limit:v1:anonymous:*",
      "rate-limit:v1:auth-email:*",
      "rate-limit:v1:auth-ip:*",
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } finally {
    await redis.quit();
  }
};

const createVerificationUrl = async (
  config: SeedConfig,
  input: {
    callbackUrl: string;
    payload: Record<string, string>;
  },
): Promise<string> => {
  const token = await signJWT(input.payload, config.authSecret);
  const verificationUrl = new URL("/api/auth/verify-email", config.apiUrl);
  verificationUrl.searchParams.set("token", token);
  verificationUrl.searchParams.set("callbackURL", input.callbackUrl);

  return verificationUrl.toString();
};

export const createEmailVerificationUrl = async (
  config: SeedConfig,
  input: { callbackUrl: string; email: string },
): Promise<string> => {
  return await createVerificationUrl(config, {
    callbackUrl: input.callbackUrl,
    payload: { email: input.email.toLowerCase() },
  });
};

export const createEmailChangeUrl = async (
  config: SeedConfig,
  input: {
    callbackUrl: string;
    currentEmail: string;
    newEmail: string;
    requestType: "change-email-confirmation" | "change-email-verification";
  },
): Promise<string> => {
  return await createVerificationUrl(config, {
    callbackUrl: input.callbackUrl,
    payload: {
      email: input.currentEmail.toLowerCase(),
      requestType: input.requestType,
      updateTo: input.newEmail.toLowerCase(),
    },
  });
};

export const getEmailVerificationStatus = async (
  config: SeedConfig,
  email: string,
): Promise<boolean> =>
  withDb(config, async (db) => {
    const [user] = await db
      .select({ emailVerified: userTable.emailVerified })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${email}`);
    }

    return user.emailVerified;
  });

const insertCredentialUser = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput & { emailVerified: boolean; role: string },
): Promise<SeededUser> =>
  withDb(config, async (db) => {
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);

    await db.insert(userTable).values({
      id: userId,
      email: input.email,
      name: input.name ?? input.email,
      emailVerified: input.emailVerified,
      role: input.role,
    });
    await db.insert(accountTable).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    return { userId, email: input.email, password: input.password };
  });

export const createVerifiedAdmin = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> =>
  insertCredentialUser(config, {
    ...input,
    emailVerified: true,
    role: "admin",
  });

export const getActiveSessionCount = async (
  config: SeedConfig,
  email: string,
): Promise<number> =>
  withDb(config, async (db) => {
    const userId = await requireUserId(db, email);

    const sessions = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, userId));

    return sessions.length;
  });

export const createSessionCookie = async (
  config: SeedConfig,
  input: { email: string; userAgent?: string },
): Promise<SeededSessionCookie> =>
  withDb(config, async (db) => {
    const userId = await requireUserId(db, input.email);

    const token = crypto.randomUUID();
    await db.insert(sessionTable).values({
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      id: crypto.randomUUID(),
      token,
      userAgent: input.userAgent,
      userId,
    });

    const signature = await makeSignature(token, config.authSecret);

    return {
      name: "better-auth.session_token",
      value: `${token}.${signature}`,
    };
  });

export const getUserEmail = async (
  config: SeedConfig,
  userId: string,
): Promise<string> =>
  withDb(config, async (db) => {
    const [user] = await db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${userId}`);
    }

    return user.email;
  });

export const getPasswordResetToken = async (
  config: SeedConfig,
  email: string,
): Promise<string> =>
  withDb(config, async (db) => {
    const userId = await requireUserId(db, email);

    const [verification] = await db
      .select({ identifier: verificationTable.identifier })
      .from(verificationTable)
      .where(
        and(
          eq(verificationTable.value, userId),
          like(verificationTable.identifier, `${RESET_PASSWORD_PREFIX}%`),
        ),
      )
      .orderBy(desc(verificationTable.createdAt))
      .limit(1);

    if (!verification) {
      throw new Error(`no password reset token for ${email}`);
    }

    return verification.identifier.slice(RESET_PASSWORD_PREFIX.length);
  });

export type SeedLeadInput = Pick<LeadInsert, "skoolUsername" | "name"> &
  Partial<Omit<LeadInsert, "leadId" | "createdAt" | "updatedAt">>;

export const createLead = async (
  config: SeedConfig,
  input: SeedLeadInput,
): Promise<Lead> =>
  withDb(config, async (db) => {
    const [lead] = await db.insert(leadsTable).values(input).returning();

    if (!lead) throw new Error("lead was not created");

    return lead;
  });

export interface SeedCommunityInput {
  leadId: number;
  skoolId: string;
  name: string;
  displayName: string;
  memberCount: number;
  /** Cents per month; leave out for a free community */
  monthlyPrice?: number;
}

export const createCommunity = async (
  config: SeedConfig,
  input: SeedCommunityInput,
): Promise<Community> =>
  withDb(config, async (db) => {
    const monthlyUsd =
      input.monthlyPrice === undefined ? null : input.monthlyPrice / 100;

    const [community] = await db
      .insert(communitiesTable)
      .values({
        leadId: input.leadId,
        skoolId: input.skoolId,
        name: input.name,
        displayName: input.displayName,
        communityUrl: `https://www.skool.com/${input.name}`,
        memberCount: input.memberCount,
        pricingType: monthlyUsd === null ? "free" : "paid",
        pricingInterval: monthlyUsd === null ? null : "month",
        priceAmount: input.monthlyPrice ?? 0,
        priceCurrency: monthlyUsd === null ? null : "USD",
        prices:
          monthlyUsd === null
            ? [{ type: "free", interval: null, amount: 0, currency: null }]
            : [
                {
                  type: "paid",
                  interval: "month",
                  amount: input.monthlyPrice ?? 0,
                  currency: "USD",
                },
              ],
        monthlyPriceUsd: monthlyUsd,
        estMonthlyRevenue:
          monthlyUsd === null ? null : monthlyUsd * input.memberCount,
      })
      .returning();

    if (!community) throw new Error("community was not created");

    return community;
  });

export type SeedCampaignInput = Pick<CampaignInsert, "name"> &
  Partial<Omit<CampaignInsert, "campaignId" | "createdAt" | "updatedAt">>;

export const createCampaign = async (
  config: SeedConfig,
  input: SeedCampaignInput,
): Promise<Campaign> =>
  withDb(config, async (db) => {
    const [campaign] = await db
      .insert(campaignsTable)
      .values({
        keywords: ["coaching"],
        types: ["public"],
        pricingModels: ["paid"],
        ...input,
      })
      .returning();

    if (!campaign) throw new Error("campaign was not created");

    return campaign;
  });

export interface SeedCampaignLead {
  leadId: number;
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  status: "pending" | "running" | "done" | "failed";
  keyword?: string;
}

export const attachCampaignLeads = async (
  config: SeedConfig,
  input: { campaignId: number; leads: SeedCampaignLead[] },
): Promise<void> =>
  withDb(config, async (db) => {
    await db.insert(campaignLeadsTable).values(
      input.leads.map((lead) => ({
        campaignId: input.campaignId,
        leadId: lead.leadId,
        stage: lead.stage,
        status: lead.status,
        keyword: lead.keyword ?? null,
      })),
    );
  });

export const createScrapeRun = async (
  config: SeedConfig,
  input: {
    campaignId: number;
    status: "queued" | "running" | "completed" | "failed";
  },
): Promise<ScrapeRun> =>
  withDb(config, async (db) => {
    const [run] = await db
      .insert(scrapeRunsTable)
      .values({ campaignId: input.campaignId, status: input.status })
      .returning();

    if (!run) throw new Error("scrape run was not created");

    return run;
  });

export const findLeadByUsername = async (
  config: SeedConfig,
  skoolUsername: string,
): Promise<Lead | null> =>
  withDb(config, async (db) => {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.skoolUsername, skoolUsername))
      .limit(1);

    return lead ?? null;
  });

export const listLeadsByUsernamePrefix = async (
  config: SeedConfig,
  prefix: string,
): Promise<Lead[]> =>
  withDb(config, (db) =>
    db
      .select()
      .from(leadsTable)
      .where(like(leadsTable.skoolUsername, `${prefix}%`))
      .orderBy(asc(leadsTable.leadId)),
  );

export const findCommunityBySkoolId = async (
  config: SeedConfig,
  skoolId: string,
): Promise<Community | null> =>
  withDb(config, async (db) => {
    const [community] = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.skoolId, skoolId))
      .limit(1);

    return community ?? null;
  });

export const listCommunitiesByLeadId = async (
  config: SeedConfig,
  leadId: number,
): Promise<Community[]> =>
  withDb(config, (db) =>
    db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.leadId, leadId))
      .orderBy(asc(communitiesTable.communityId)),
  );

export const findCampaignByName = async (
  config: SeedConfig,
  name: string,
): Promise<Campaign | null> =>
  withDb(config, async (db) => {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.name, name))
      .limit(1);

    return campaign ?? null;
  });

export interface CampaignLeadRow {
  skoolUsername: string;
  leadId: number;
  stage: number;
  status: string;
  keyword: string | null;
}

export const listCampaignLeads = async (
  config: SeedConfig,
  campaignId: number,
): Promise<CampaignLeadRow[]> =>
  withDb(config, (db) =>
    db
      .select({
        skoolUsername: leadsTable.skoolUsername,
        leadId: leadsTable.leadId,
        stage: campaignLeadsTable.stage,
        status: campaignLeadsTable.status,
        keyword: campaignLeadsTable.keyword,
      })
      .from(campaignLeadsTable)
      .innerJoin(leadsTable, eq(leadsTable.leadId, campaignLeadsTable.leadId))
      .where(eq(campaignLeadsTable.campaignId, campaignId))
      .orderBy(asc(leadsTable.skoolUsername)),
  );

export const listScrapeRuns = async (
  config: SeedConfig,
  campaignId: number,
): Promise<ScrapeRun[]> =>
  withDb(config, (db) =>
    db
      .select()
      .from(scrapeRunsTable)
      .where(eq(scrapeRunsTable.campaignId, campaignId))
      .orderBy(desc(scrapeRunsTable.scrapeRunId)),
  );

export const scriptSkool = async (
  config: SeedConfig,
  script: SkoolScript,
): Promise<void> => {
  const redis = new IORedis(config.redisUrl);

  try {
    await writeSkoolScript(redis, script);
  } finally {
    await redis.quit();
  }
};

export const unscriptSkool = async (
  config: SeedConfig,
  script: SkoolScript,
): Promise<void> => {
  const redis = new IORedis(config.redisUrl);

  try {
    await clearSkoolScript(redis, script);
  } finally {
    await redis.quit();
  }
};

export type { SkoolScript } from "../infrastructure/skool/scripted/script";
