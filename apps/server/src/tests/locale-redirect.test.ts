import { expect, test } from "bun:test";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { initApp } from "@server/app";
import { initENV } from "@server/config/env";
import { initDB } from "@server/infrastructure/database/client";
import { TEST_DB_TEMPLATE } from "./setup";
import { createContext } from "./helpers/billing";

test("root redirect resolves locale by NEXT_LOCALE cookie, then Accept-Language, then default", async () => {
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
    const app = await initApp({
      context: createContext(connection.db, connection.pool, env),
    });

    const locationFor = async (headers: Record<string, string>) => {
      const response = await app.request("/", { headers });
      expect(response.status).toBe(302);
      return response.headers.get("location");
    };

    // A valid NEXT_LOCALE cookie takes precedence over Accept-Language.
    expect(
      await locationFor({
        cookie: "NEXT_LOCALE=fr",
        "accept-language": "es-ES,es;q=0.9",
      }),
    ).toBe("/fr/");

    // An unsupported cookie value is ignored and Accept-Language wins.
    expect(
      await locationFor({
        cookie: "NEXT_LOCALE=de",
        "accept-language": "es-ES,es;q=0.9",
      }),
    ).toBe("/es/");

    // With no cookie, the first supported Accept-Language entry is used.
    expect(
      await locationFor({ "accept-language": "pt-PT,pt;q=0.9,fr;q=0.8" }),
    ).toBe("/fr/");

    // An unsupported Accept-Language falls back to the default locale.
    expect(await locationFor({ "accept-language": "de-DE,de;q=0.9" })).toBe(
      "/en/",
    );

    // No signals at all falls back to the default locale.
    expect(await locationFor({})).toBe("/en/");
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});
