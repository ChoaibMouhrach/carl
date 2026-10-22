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

describe("the AI key", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env["OPENAI_API_KEY"];
  });

  afterEach(() => {
    if (original === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = original;
  });

  test("is required: a missing or empty key stops the server from starting", () => {
    delete process.env["OPENAI_API_KEY"];
    expect(() => initENV()).toThrow(/OPENAI_API_KEY/);

    process.env["OPENAI_API_KEY"] = "";
    expect(() => initENV()).toThrow(/OPENAI_API_KEY/);
  });

  test("is passed through as given when it is set", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-key";

    expect(initENV().OPENAI_API_KEY).toBe("sk-test-key");
  });
});

describe("the AI filter concurrency", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env["AI_FILTER_CONCURRENCY"];
    process.env["OPENAI_API_KEY"] ??= "sk-test-key";
  });

  afterEach(() => {
    if (original === undefined) delete process.env["AI_FILTER_CONCURRENCY"];
    else process.env["AI_FILTER_CONCURRENCY"] = original;
  });

  test("defaults to twelve", () => {
    delete process.env["AI_FILTER_CONCURRENCY"];

    expect(initENV().AI_FILTER_CONCURRENCY).toBe(12);
  });

  test("reads a number and refuses zero, a fraction or more than 64", () => {
    process.env["AI_FILTER_CONCURRENCY"] = "20";
    expect(initENV().AI_FILTER_CONCURRENCY).toBe(20);

    for (const bad of ["0", "1.5", "65", "many"]) {
      process.env["AI_FILTER_CONCURRENCY"] = bad;
      expect(() => initENV()).toThrow(/AI_FILTER_CONCURRENCY/);
    }
  });
});

describe("the web search settings", () => {
  let key: string | undefined;
  let concurrency: string | undefined;

  beforeEach(() => {
    key = process.env["TAVILY_API_KEY"];
    concurrency = process.env["ENRICH_CONCURRENCY"];
    process.env["OPENAI_API_KEY"] ??= "sk-test-key";
    process.env["TAVILY_API_KEY"] ??= "tvly-test-key";
  });

  afterEach(() => {
    if (key === undefined) delete process.env["TAVILY_API_KEY"];
    else process.env["TAVILY_API_KEY"] = key;
    if (concurrency === undefined) delete process.env["ENRICH_CONCURRENCY"];
    else process.env["ENRICH_CONCURRENCY"] = concurrency;
  });

  test("the key is required: a missing or empty key stops the server from starting", () => {
    delete process.env["TAVILY_API_KEY"];
    expect(() => initENV()).toThrow(/TAVILY_API_KEY/);

    process.env["TAVILY_API_KEY"] = "";
    expect(() => initENV()).toThrow(/TAVILY_API_KEY/);
  });

  test("the concurrency is 5 by default and must be a whole number from 1 to 32", () => {
    delete process.env["ENRICH_CONCURRENCY"];
    expect(initENV().ENRICH_CONCURRENCY).toBe(5);

    process.env["ENRICH_CONCURRENCY"] = "32";
    expect(initENV().ENRICH_CONCURRENCY).toBe(32);

    for (const bad of ["0", "33", "2.5", "many"]) {
      process.env["ENRICH_CONCURRENCY"] = bad;
      expect(() => initENV()).toThrow(/ENRICH_CONCURRENCY/);
    }
  });
});
