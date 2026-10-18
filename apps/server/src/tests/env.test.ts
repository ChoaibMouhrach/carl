import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initENV } from "@server/config/env";

const CONNECTION_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASS",
  "POSTGRES_NAME",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_PASSWORD",
];

const withConnectionEnv = (values: Record<string, string>) => {
  for (const key of CONNECTION_KEYS) {
    delete process.env[key];
  }

  Object.assign(process.env, values);
};

const individualKeys = {
  POSTGRES_HOST: "db.internal",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "app",
  POSTGRES_PASS: "p@ss/w:rd",
  POSTGRES_NAME: "carl",
  REDIS_HOST: "cache.internal",
  REDIS_PORT: "6379",
  REDIS_PASSWORD: "r@dis/pass",
};

describe("database and redis connection env", () => {
  let original: Record<string, string | undefined>;

  beforeEach(() => {
    original = Object.fromEntries(
      CONNECTION_KEYS.map((key) => [key, process.env[key]]),
    );
  });

  afterEach(() => {
    for (const key of CONNECTION_KEYS) {
      const value = original[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("builds both connection strings from the individual keys and encodes credentials", () => {
    withConnectionEnv(individualKeys);

    const env = initENV();

    expect(env.POSTGRES_CONNECTION_STRING).toBe(
      "postgresql://app:p%40ss%2Fw%3Ard@db.internal:5432/carl",
    );
    expect(env.REDIS_CONNECTION_STRING).toBe(
      "redis://:r%40dis%2Fpass@cache.internal:6379",
    );
  });

  test("accepts connection URLs alone, without any individual key", () => {
    withConnectionEnv({
      POSTGRES_URL: "postgresql://u:pw@postgres.example:5433/appdb",
      REDIS_URL: "redis://:secret@redis.example:6380",
    });

    const env = initENV();

    expect(env.POSTGRES_CONNECTION_STRING).toBe(
      "postgresql://u:pw@postgres.example:5433/appdb",
    );
    expect(env.REDIS_CONNECTION_STRING).toBe(
      "redis://:secret@redis.example:6380",
    );
  });

  test("lets a URL win over the individual keys, and mixes the two services freely", () => {
    withConnectionEnv({
      ...individualKeys,
      POSTGRES_URL: "postgres://u:pw@url-host:5432/urldb",
    });

    const env = initENV();

    expect(env.POSTGRES_CONNECTION_STRING).toBe(
      "postgres://u:pw@url-host:5432/urldb",
    );
    expect(env.REDIS_CONNECTION_STRING).toBe(
      "redis://:r%40dis%2Fpass@cache.internal:6379",
    );
  });

  test("treats empty values as unset", () => {
    withConnectionEnv({
      ...individualKeys,
      POSTGRES_URL: "",
      REDIS_URL: "",
    });

    const env = initENV();

    expect(env.POSTGRES_CONNECTION_STRING).toContain("@db.internal:5432/carl");
    expect(env.REDIS_CONNECTION_STRING).toContain("@cache.internal:6379");
  });

  test("requires either a URL or every individual key for postgres", () => {
    withConnectionEnv({
      REDIS_URL: "redis://:secret@redis.example:6380",
      POSTGRES_HOST: "db.internal",
    });

    expect(() => initENV()).toThrow(
      /POSTGRES_PORT is required unless POSTGRES_URL is set/,
    );
    expect(() => initENV()).toThrow(
      /POSTGRES_NAME is required unless POSTGRES_URL is set/,
    );
  });

  test("requires either a URL or every individual key for redis", () => {
    withConnectionEnv({
      POSTGRES_URL: "postgresql://u:pw@postgres.example:5433/appdb",
      REDIS_HOST: "cache.internal",
    });

    expect(() => initENV()).toThrow(
      /REDIS_PORT is required unless REDIS_URL is set/,
    );
    expect(() => initENV()).toThrow(
      /REDIS_PASSWORD is required unless REDIS_URL is set/,
    );
  });

  test("rejects a URL with the wrong protocol", () => {
    withConnectionEnv({
      ...individualKeys,
      POSTGRES_URL: "mysql://u:pw@host:3306/db",
    });

    expect(() => initENV()).toThrow(/POSTGRES_URL/);
  });
});
