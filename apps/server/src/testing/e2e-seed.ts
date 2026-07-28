import { and, desc, eq, like } from "drizzle-orm";
import { makeSignature, signJWT } from "better-auth/crypto";
import IORedis from "ioredis";
import { initDB } from "../infrastructure/database/client";
import {
  billingCustomersTable,
  sessionTable,
  subscriptionsTable,
  userTable,
  verificationTable,
} from "../infrastructure/database/schemas";

const RESET_PASSWORD_PREFIX = "reset-password:";

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
): Promise<boolean> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ emailVerified: userTable.emailVerified })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${email}`);
    }

    return user.emailVerified;
  } finally {
    await connection.pool.end();
  }
};

export const createVerifiedUser = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> => {
  const response = await fetch(`${config.apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: config.webOrigin,
    },
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

  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [row] = await connection.db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.email, input.email))
      .returning({ userId: userTable.id });

    if (!row) {
      throw new Error(`user not found after sign-up: ${input.email}`);
    }

    return { userId: row.userId, email: input.email, password: input.password };
  } finally {
    await connection.pool.end();
  }
};

export const createVerifiedAdmin = async (
  config: SeedConfig,
  input: CreateVerifiedUserInput,
): Promise<SeededUser> => {
  const user = await createVerifiedUser(config, input);
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    await connection.db
      .update(userTable)
      .set({ role: "admin" })
      .where(eq(userTable.id, user.userId));

    return user;
  } finally {
    await connection.pool.end();
  }
};

export const createOnboardedUser = async (
  config: SeedConfig,
  input: CreateOnboardedUserInput,
): Promise<SeededUser> => {
  const user = await createVerifiedUser(config, input);
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });
  const suffix = crypto.randomUUID();

  try {
    const [customer] = await connection.db
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

    await connection.db.insert(subscriptionsTable).values({
      billingCustomerId: customer.billingCustomerId,
      billingInterval: "monthly",
      planKey: "starter",
      provider: "e2e",
      providerSubscriptionId: `e2e-subscription-${suffix}`,
      status: input.subscriptionStatus ?? "active",
    });

    return user;
  } finally {
    await connection.pool.end();
  }
};

export const getActiveSessionCount = async (
  config: SeedConfig,
  email: string,
): Promise<number> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${email}`);
    }

    const sessions = await connection.db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, user.id));

    return sessions.length;
  } finally {
    await connection.pool.end();
  }
};

export const createSessionCookie = async (
  config: SeedConfig,
  input: { email: string; userAgent?: string },
): Promise<SeededSessionCookie> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, input.email))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${input.email}`);
    }

    const token = crypto.randomUUID();
    await connection.db.insert(sessionTable).values({
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      id: crypto.randomUUID(),
      token,
      userAgent: input.userAgent,
      userId: user.id,
    });

    const signature = await makeSignature(token, config.authSecret);

    return {
      name: "better-auth.session_token",
      value: `${token}.${signature}`,
    };
  } finally {
    await connection.pool.end();
  }
};

export const getUserEmail = async (
  config: SeedConfig,
  userId: string,
): Promise<string> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${userId}`);
    }

    return user.email;
  } finally {
    await connection.pool.end();
  }
};

export const userExists = async (
  config: SeedConfig,
  userId: string,
): Promise<boolean> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    return Boolean(user);
  } finally {
    await connection.pool.end();
  }
};

export const getPasswordResetToken = async (
  config: SeedConfig,
  email: string,
): Promise<string> => {
  const connection = await initDB({
    connectionCredentials: config.databaseUrl,
  });

  try {
    const [user] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (!user) {
      throw new Error(`no user for ${email}`);
    }

    const [verification] = await connection.db
      .select({ identifier: verificationTable.identifier })
      .from(verificationTable)
      .where(
        and(
          eq(verificationTable.value, user.id),
          like(verificationTable.identifier, `${RESET_PASSWORD_PREFIX}%`),
        ),
      )
      .orderBy(desc(verificationTable.createdAt))
      .limit(1);

    if (!verification) {
      throw new Error(`no password reset token for ${email}`);
    }

    return verification.identifier.slice(RESET_PASSWORD_PREFIX.length);
  } finally {
    await connection.pool.end();
  }
};
