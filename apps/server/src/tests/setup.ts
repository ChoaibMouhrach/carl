import { afterAll, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { initENV } from "@server/config/env";
import { initDB } from "@server/infrastructure/database/client";

export const TEST_DB_TEMPLATE = "saasTemplate_test_template";

beforeAll(async () => {
  const env = initENV();
  const connection = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });

  await connection.db.execute(sql.raw(`CREATE DATABASE ${TEST_DB_TEMPLATE}`));
  await connection.pool.end();

  const template = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: TEST_DB_TEMPLATE,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  await template.migrate();
  await template.pool.end();
});

afterAll(async () => {
  const env = initENV();
  const connection = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });

  await connection.db.execute(
    sql.raw(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB_TEMPLATE}'
        AND pid <> pg_backend_pid()
    `),
  );
  await connection.db.execute(sql.raw(`DROP DATABASE ${TEST_DB_TEMPLATE}`));
  await connection.pool.end();
});
