import crypto from "crypto";
import { sql } from "drizzle-orm";
import { initApp, type App } from "@server/app";
import { AUTH_SESSION_COOKIE_NAME } from "@server/config/constants";
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
    userId: number;
  };
}

export const createAuthenticatedApp = async (input: {
  context: Context;
  email: string;
  role?: "admin" | "user";
}): Promise<AuthenticatedApp> => {
  const user = await input.context.repositories.user.create({
    email: input.email,
    emailVerifiedAt: new Date(),
    role: input.role ?? "user",
  });
  const session = crypto.randomUUID();
  await input.context.repositories.session.create({
    expiresAt: new Date(Date.now() + 60_000),
    session,
    userId: user.userId,
  });

  return {
    app: await initApp({ context: input.context }),
    cookie: `${AUTH_SESSION_COOKIE_NAME}=${session}`,
    user,
  };
};
