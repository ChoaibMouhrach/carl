import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { initApp, type App } from "@server/app";
import { initENV } from "@server/config/env";
import { initDB, type DB } from "@server/infrastructure/database/client";
import type { Context } from "@server/context";
import type { Pool } from "pg";
import { TEST_DB_TEMPLATE } from "../setup";
import { createContext } from "./billing";

interface TestDatabase {
  context: Context;
  db: DB;
  pool: Pool;
}

export const withTestDatabase = async (
  callback: (database: TestDatabase) => Promise<void>,
): Promise<void> => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );
  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    await callback({
      context: createContext(connection.db, connection.pool, env),
      db: connection.db,
      pool: connection.pool,
    });
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
};

interface AuthenticatedApp {
  app: App;
  cookie: string;
  user: {
    email: string;
    userId: string;
  };
}

export const createAuthenticatedApp = async (input: {
  context: Context;
  email: string;
  role?: "admin" | "user";
}): Promise<AuthenticatedApp> => {
  const created = await input.context.auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: "password-that-is-long-enough",
    },
  });
  await input.context.repositories.user.update(
    { userId: created.user.id },
    { emailVerified: true, role: input.role ?? "user" },
  );
  const app = await initApp({ context: input.context });
  const response = await app.request("/api/auth/sign-in/email", {
    body: JSON.stringify({
      email: input.email,
      password: "password-that-is-long-enough",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];

  if (!cookie) {
    throw new Error("Better Auth did not create a session cookie.");
  }

  return {
    app,
    cookie,
    user: { email: input.email, userId: created.user.id },
  };
};
