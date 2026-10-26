import { and, desc, eq, like } from "drizzle-orm";
import { hashPassword, makeSignature, signJWT } from "better-auth/crypto";
import IORedis from "ioredis";
import { initDB, type DB } from "../infrastructure/database/client";
import {
  accountTable,
  campaignCommunitiesTable,
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
  sessionTable,
  userTable,
  verificationTable,
} from "../infrastructure/database/schemas";

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

export const createVerifiedMember = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> =>
  insertCredentialUser(config, {
    ...input,
    emailVerified: true,
    role: "user",
  });

export const setUserRole = async (
  config: SeedConfig,
  input: { email: string; role: "admin" | "user" },
): Promise<void> =>
  withDb(config, async (db) => {
    await db
      .update(userTable)
      .set({ role: input.role })
      .where(eq(userTable.email, input.email));
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

export const banUser = async (
  config: SeedConfig,
  email: string,
): Promise<void> =>
  withDb(config, async (db) => {
    await db
      .update(userTable)
      .set({ banned: true })
      .where(eq(userTable.email, email));
  });

export const deleteUser = async (
  config: SeedConfig,
  email: string,
): Promise<void> =>
  withDb(config, async (db) => {
    await db.delete(userTable).where(eq(userTable.email, email));
  });

/** Makes every session of the user older than Better Auth's freshness window */
export const ageSessions = async (
  config: SeedConfig,
  email: string,
): Promise<void> =>
  withDb(config, async (db) => {
    const userId = await requireUserId(db, email);

    await db
      .update(sessionTable)
      .set({ createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })
      .where(eq(sessionTable.userId, userId));
  });

export interface SeedLeadInput {
  name: string;
  username: string;
  email?: string | null;
  bio?: string | null;
  pictureUrl?: string | null;
}

export const createLead = async (config: SeedConfig, input: SeedLeadInput) =>
  withDb(config, async (db) => {
    const [lead] = await db
      .insert(leadsTable)
      .values({
        name: input.name,
        username: input.username,
        skoolUrl: `https://www.skool.com/@${input.username}`,
        email: input.email ?? null,
        bio: input.bio ?? null,
        pictureUrl: input.pictureUrl ?? null,
      })
      .returning();

    if (!lead) {
      throw new Error(`could not create lead ${input.username}`);
    }

    return lead;
  });

export interface SeedCommunityInput {
  leadId: number;
  name: string;
  slug: string;
  members?: number | null;
  mrr?: number | null;
  email?: string | null;
  priceCents?: number | null;
}

export const createCommunity = async (
  config: SeedConfig,
  input: SeedCommunityInput,
) =>
  withDb(config, async (db) => {
    const paid = input.priceCents !== undefined && input.priceCents !== null;

    const [community] = await db
      .insert(communitiesTable)
      .values({
        leadId: input.leadId,
        name: input.name,
        skoolUrl: `https://www.skool.com/${input.slug}`,
        members: input.members ?? null,
        mrr: input.mrr ?? null,
        email: input.email ?? null,
        isFree: !paid,
        priceCents: paid ? input.priceCents : null,
        priceCurrency: paid ? "usd" : null,
        priceInterval: paid ? "month" : null,
      })
      .returning();

    if (!community) {
      throw new Error(`could not create community ${input.slug}`);
    }

    return community;
  });

/** Many leads at once, named `<prefix> 01`, `<prefix> 02`, ... with usernames `<prefix>-01`, ... */
export const createLeads = async (
  config: SeedConfig,
  input: { prefix: string; count: number },
) =>
  withDb(config, async (db) =>
    db
      .insert(leadsTable)
      .values(
        Array.from({ length: input.count }, (_, index) => {
          const number = String(index + 1).padStart(2, "0");

          return {
            name: `${input.prefix} ${number}`,
            username: `${input.prefix}-${number}`,
            skoolUrl: `https://www.skool.com/@${input.prefix}-${number}`,
          };
        }),
      )
      .returning(),
  );

export const findLeadByUsername = async (
  config: SeedConfig,
  username: string,
) =>
  withDb(config, async (db) => {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.username, username))
      .limit(1);

    return lead ?? null;
  });

export const findCommunityBySlug = async (config: SeedConfig, slug: string) =>
  withDb(config, async (db) => {
    const [community] = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.skoolUrl, `https://www.skool.com/${slug}`))
      .limit(1);

    return community ?? null;
  });

export const countLeadsWithPrefix = async (
  config: SeedConfig,
  prefix: string,
): Promise<number> =>
  withDb(config, async (db) => {
    const leads = await db
      .select({ leadId: leadsTable.leadId })
      .from(leadsTable)
      .where(like(leadsTable.username, `${prefix}%`));

    return leads.length;
  });

export const countCommunitiesWithPrefix = async (
  config: SeedConfig,
  prefix: string,
): Promise<number> =>
  withDb(config, async (db) => {
    const communities = await db
      .select({ communityId: communitiesTable.communityId })
      .from(communitiesTable)
      .where(
        like(communitiesTable.skoolUrl, `https://www.skool.com/${prefix}%`),
      );

    return communities.length;
  });

export interface SeedCampaignInput {
  name: string;
  keyword: string;
  description?: string | null;
  minPriceCents?: number | null;
  minMembers?: number | null;
}

export const createCampaign = async (
  config: SeedConfig,
  input: SeedCampaignInput,
) =>
  withDb(config, async (db) => {
    const [campaign] = await db
      .insert(campaignsTable)
      .values({
        name: input.name,
        keyword: input.keyword,
        description: input.description ?? null,
        minPriceCents: input.minPriceCents ?? null,
        minMembers: input.minMembers ?? null,
      })
      .returning();

    if (!campaign) {
      throw new Error(`could not create campaign ${input.name}`);
    }

    return campaign;
  });

export const findCampaignByName = async (config: SeedConfig, name: string) =>
  withDb(config, async (db) => {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.name, name))
      .limit(1);

    return campaign ?? null;
  });

export const countCampaignsContaining = async (
  config: SeedConfig,
  fragment: string,
): Promise<number> =>
  withDb(config, async (db) => {
    const campaigns = await db
      .select({ campaignId: campaignsTable.campaignId })
      .from(campaignsTable)
      .where(like(campaignsTable.name, `%${fragment}%`));

    return campaigns.length;
  });

export const deleteCampaignsContaining = async (
  config: SeedConfig,
  fragment: string,
): Promise<void> =>
  withDb(config, async (db) => {
    await db
      .delete(campaignsTable)
      .where(like(campaignsTable.name, `%${fragment}%`));
  });

export const addLeadsToCampaign = async (
  config: SeedConfig,
  input: { campaignId: number; leadIds: number[] },
): Promise<void> =>
  withDb(config, async (db) => {
    await db.insert(campaignLeadsTable).values(
      input.leadIds.map((leadId) => ({
        campaignId: input.campaignId,
        leadId,
      })),
    );
  });

export const addCommunitiesToCampaign = async (
  config: SeedConfig,
  input: { campaignId: number; communityIds: number[] },
): Promise<void> =>
  withDb(config, async (db) => {
    await db.insert(campaignCommunitiesTable).values(
      input.communityIds.map((communityId) => ({
        campaignId: input.campaignId,
        communityId,
      })),
    );
  });

export const listCampaignLeadIds = async (
  config: SeedConfig,
  campaignId: number,
): Promise<number[]> =>
  withDb(config, async (db) => {
    const rows = await db
      .select({ leadId: campaignLeadsTable.leadId })
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaignId));

    return rows.map((row) => row.leadId).sort((a, b) => a - b);
  });

export const listCampaignCommunityIds = async (
  config: SeedConfig,
  campaignId: number,
): Promise<number[]> =>
  withDb(config, async (db) => {
    const rows = await db
      .select({ communityId: campaignCommunitiesTable.communityId })
      .from(campaignCommunitiesTable)
      .where(eq(campaignCommunitiesTable.campaignId, campaignId));

    return rows.map((row) => row.communityId).sort((a, b) => a - b);
  });
