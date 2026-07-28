import { and, desc, eq, like } from "drizzle-orm";
import { signJWT } from "better-auth/crypto";
import { initDB } from "../infrastructure/database/client";
import {
  userTable,
  verificationTable,
} from "../infrastructure/database/schemas";

const RESET_PASSWORD_PREFIX = "reset-password:";

export interface SeedConfig {
  apiUrl: string;
  authSecret: string;
  databaseUrl: string;
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

export const createEmailVerificationUrl = async (
  config: SeedConfig,
  input: { callbackUrl: string; email: string },
): Promise<string> => {
  const token = await signJWT(
    { email: input.email.toLowerCase() },
    config.authSecret,
  );
  const verificationUrl = new URL("/api/auth/verify-email", config.apiUrl);
  verificationUrl.searchParams.set("token", token);
  verificationUrl.searchParams.set("callbackURL", input.callbackUrl);

  return verificationUrl.toString();
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
