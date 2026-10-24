import { and, desc, eq, like } from "drizzle-orm";
import { hashPassword, makeSignature, signJWT } from "better-auth/crypto";
import IORedis from "ioredis";
import { initDB, type DB } from "../infrastructure/database/client";
import {
  accountTable,
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
