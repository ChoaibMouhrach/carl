import { and, desc, eq, like, sql } from "drizzle-orm";
import { makeSignature, signJWT } from "better-auth/crypto";
import IORedis from "ioredis";
import { initDB, type DB } from "../infrastructure/database/client";
import {
  billingCustomersTable,
  chunksTable,
  clientsTable,
  filesTable,
  foldersTable,
  oauthAccessTokenTable,
  oauthApplicationTable,
  oauthConsentTable,
  sessionTable,
  subscriptionsTable,
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

export interface CreateOnboardedUserInput extends CreateVerifiedUserInput {
  subscriptionStatus?: "active" | "canceled";
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

const signUp = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<void> => {
  const response = await fetch(`${config.apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: jsonHeaders(config),
    body: JSON.stringify({
      email: input.email,
      name: input.name ?? input.email,
      password: input.password,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`sign-up failed (${response.status}): ${body}`);
  }
};

export const createUnverifiedUser = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> => {
  await signUp(config, input);

  return withDb(config, async (db) => {
    const userId = await requireUserId(db, input.email);

    return { userId, email: input.email, password: input.password };
  });
};

export const createVerifiedUser = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> => {
  await signUp(config, input);

  return withDb(config, async (db) => {
    const [row] = await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.email, input.email))
      .returning({ userId: userTable.id });

    if (!row) {
      throw new Error(`user not found after sign-up: ${input.email}`);
    }

    return { userId: row.userId, email: input.email, password: input.password };
  });
};

// Inserts rows directly so bulk seeding (e.g. pagination) skips the sign-up
// API and its rate limits. These users have no credentials.
export const createUsers = async (
  config: SeedConfig,
  emails: string[],
): Promise<void> => {
  await withDb(config, async (db) => {
    await db.insert(userTable).values(
      emails.map((email) => ({
        id: crypto.randomUUID(),
        email,
        name: email,
        emailVerified: true,
      })),
    );
  });
};

export const createVerifiedAdmin = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> => {
  const user = await createVerifiedUser(config, input);

  return withDb(config, async (db) => {
    await db
      .update(userTable)
      .set({ role: "admin" })
      .where(eq(userTable.id, user.userId));

    return user;
  });
};

export const createOnboardedUser = async (
  config: SeedConfig,
  input: CreateOnboardedUserInput,
): Promise<SeededUser> => {
  const user = await createVerifiedUser(config, input);
  const suffix = crypto.randomUUID();

  return withDb(config, async (db) => {
    const [customer] = await db
      .insert(billingCustomersTable)
      .values({
        provider: "e2e",
        providerCustomerId: `e2e-customer-${suffix}`,
        userId: user.userId,
      })
      .returning({
        billingCustomerId: billingCustomersTable.billingCustomerId,
      });

    if (!customer) {
      throw new Error(`failed to create billing customer for ${input.email}`);
    }

    await db.insert(subscriptionsTable).values({
      billingCustomerId: customer.billingCustomerId,
      billingInterval: "monthly",
      planKey: "starter",
      provider: "e2e",
      providerSubscriptionId: `e2e-subscription-${suffix}`,
      status: input.subscriptionStatus ?? "active",
    });

    return user;
  });
};

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

export const userExists = async (
  config: SeedConfig,
  userId: string,
): Promise<boolean> =>
  withDb(config, async (db) => {
    const [user] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    return Boolean(user);
  });

export interface SeededClient {
  clientId: number;
  userId: string;
  name: string;
  email: string;
}

export const createClient = async (
  config: SeedConfig,
  input: { userId: string; name?: string; email?: string },
): Promise<SeededClient> =>
  withDb(config, async (db) => {
    const [row] = await db
      .insert(clientsTable)
      .values({
        userId: input.userId,
        name: input.name ?? "E2E Client",
        email: input.email ?? `e2e-client-${crypto.randomUUID()}@example.com`,
      })
      .returning();

    if (!row) {
      throw new Error("failed to create client");
    }

    return row;
  });

export const getClient = async (
  config: SeedConfig,
  clientId: number,
): Promise<SeededClient | null> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.clientId, clientId))
      .limit(1);

    return row ?? null;
  });

export const findClientByEmail = async (
  config: SeedConfig,
  email: string,
): Promise<SeededClient | null> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.email, email))
      .limit(1);

    return row ?? null;
  });

export const clientExists = async (
  config: SeedConfig,
  clientId: number,
): Promise<boolean> => (await getClient(config, clientId)) !== null;

export const countClientsByUser = async (
  config: SeedConfig,
  userId: string,
): Promise<number> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(clientsTable)
      .where(eq(clientsTable.userId, userId));

    return row?.count ?? 0;
  });

export interface SeededFolder {
  folderId: number;
  clientId: number;
  userId: string;
  parentId: number | null;
  name: string;
}

export const createFolder = async (
  config: SeedConfig,
  input: {
    clientId: number;
    userId: string;
    name: string;
    parentId?: number | null;
  },
): Promise<SeededFolder> =>
  withDb(config, async (db) => {
    const [row] = await db
      .insert(foldersTable)
      .values({
        clientId: input.clientId,
        userId: input.userId,
        name: input.name,
        parentId: input.parentId ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("failed to create folder");
    }

    return row;
  });

export interface SeededFile {
  fileId: number;
  clientId: number | null;
  userId: string | null;
  folderId: number | null;
  name: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  key: string;
}

export const createFile = async (
  config: SeedConfig,
  input: {
    clientId: number;
    userId: string;
    folderId?: number | null;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  },
): Promise<SeededFile> =>
  withDb(config, async (db) => {
    const key = `${crypto.randomUUID()}${input.name}`;

    const [row] = await db
      .insert(filesTable)
      .values({
        clientId: input.clientId,
        userId: input.userId,
        folderId: input.folderId ?? null,
        name: input.name,
        sizeBytes: input.sizeBytes ?? 1024,
        mimeType: input.mimeType ?? "text/plain",
        key,
        url: `https://storage.test/${key}`,
      })
      .returning();

    if (!row) {
      throw new Error("failed to create file");
    }

    return row;
  });

export const getFolder = async (
  config: SeedConfig,
  folderId: number,
): Promise<SeededFolder | null> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select()
      .from(foldersTable)
      .where(eq(foldersTable.folderId, folderId))
      .limit(1);

    return row ?? null;
  });

export const getFile = async (
  config: SeedConfig,
  fileId: number,
): Promise<SeededFile | null> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select()
      .from(filesTable)
      .where(eq(filesTable.fileId, fileId))
      .limit(1);

    return row ?? null;
  });

export const findFolderByName = async (
  config: SeedConfig,
  where: { clientId: number; parentId: number | null; name: string },
): Promise<SeededFolder | null> =>
  withDb(config, async (db) => {
    const conditions = [
      eq(foldersTable.clientId, where.clientId),
      eq(foldersTable.name, where.name),
      where.parentId === null
        ? sql`${foldersTable.parentId} IS NULL`
        : eq(foldersTable.parentId, where.parentId),
    ];

    const [row] = await db
      .select()
      .from(foldersTable)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  });

export const findFileByName = async (
  config: SeedConfig,
  where: { clientId: number; folderId: number | null; name: string },
): Promise<SeededFile | null> =>
  withDb(config, async (db) => {
    const conditions = [
      eq(filesTable.clientId, where.clientId),
      eq(filesTable.name, where.name),
      where.folderId === null
        ? sql`${filesTable.folderId} IS NULL`
        : eq(filesTable.folderId, where.folderId),
    ];

    const [row] = await db
      .select()
      .from(filesTable)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  });

export const folderExists = async (
  config: SeedConfig,
  folderId: number,
): Promise<boolean> => (await getFolder(config, folderId)) !== null;

export const fileExists = async (
  config: SeedConfig,
  fileId: number,
): Promise<boolean> => (await getFile(config, fileId)) !== null;

export const countFoldersByClient = async (
  config: SeedConfig,
  clientId: number,
): Promise<number> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(foldersTable)
      .where(eq(foldersTable.clientId, clientId));

    return row?.count ?? 0;
  });

export const countFilesByClient = async (
  config: SeedConfig,
  clientId: number,
): Promise<number> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(filesTable)
      .where(eq(filesTable.clientId, clientId));

    return row?.count ?? 0;
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

export interface SeededMcpConnection {
  clientId: string;
  userId: string;
  name: string;
}

export const createMcpConnection = async (
  config: SeedConfig,
  input: {
    userId: string;
    clientId?: string;
    name?: string;
    lastUsedAt?: Date;
  },
): Promise<SeededMcpConnection> =>
  withDb(config, async (db) => {
    const clientId = input.clientId ?? crypto.randomUUID();
    const name = input.name ?? "E2E MCP App";

    await db.insert(oauthApplicationTable).values({
      id: crypto.randomUUID(),
      clientId,
      name,
      redirectUrls: "",
      type: "public",
      userId: input.userId,
    });

    await db.insert(oauthAccessTokenTable).values({
      id: crypto.randomUUID(),
      accessToken: crypto.randomUUID(),
      refreshToken: crypto.randomUUID(),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      clientId,
      userId: input.userId,
      scopes: "openid",
      createdAt: input.lastUsedAt,
    });

    await db.insert(oauthConsentTable).values({
      id: crypto.randomUUID(),
      clientId,
      userId: input.userId,
      scopes: "openid",
      consentGiven: true,
    });

    return { clientId, userId: input.userId, name };
  });

export const mcpConnectionExists = async (
  config: SeedConfig,
  where: { clientId: string; userId: string },
): Promise<boolean> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select({ clientId: oauthAccessTokenTable.clientId })
      .from(oauthAccessTokenTable)
      .where(
        and(
          eq(oauthAccessTokenTable.clientId, where.clientId),
          eq(oauthAccessTokenTable.userId, where.userId),
        ),
      )
      .limit(1);

    return Boolean(row);
  });

export const countChunksByFile = async (
  config: SeedConfig,
  fileId: number,
): Promise<number> =>
  withDb(config, async (db) => {
    const [row] = await db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(chunksTable)
      .where(eq(chunksTable.fileId, fileId));

    return row?.count ?? 0;
  });
