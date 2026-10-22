import { describe, expect, test } from "bun:test";
import z from "zod";
import { PinoLogger } from "@server/infrastructure/logger/pino";

const record = z.looseObject({
  level: z.string(),
  time: z.string(),
  service: z.string(),
  hostname: z.string(),
  msg: z.string().optional(),
});

const capture = (level: "debug" | "info" | "warn" | "error" | "silent") => {
  const lines: string[] = [];
  const logger = new PinoLogger({
    level,
    destination: { write: (line: string) => void lines.push(line) },
  });

  return {
    logger,
    records: () => lines.map((line) => record.parse(JSON.parse(line))),
  };
};

describe("PinoLogger", () => {
  test("writes one JSON line per entry with a level name, an ISO time, the service and the message", async () => {
    const { logger, records } = capture("info");

    await logger.info("hello");

    const [entry] = records();
    expect(records()).toHaveLength(1);
    expect(entry).toMatchObject({
      level: "info",
      service: "carl-server",
      msg: "hello",
    });
    expect(new Date(entry?.time ?? "").toISOString()).toBe(entry?.time ?? "");
    expect(entry?.hostname.length).toBeGreaterThan(0);
  });

  test("turns the message of an object into the message and keeps its other fields", async () => {
    const { logger, records } = capture("info");

    await logger.warn({ message: "Slow", queue: "email", count: 3 });

    expect(records()[0]).toMatchObject({
      level: "warn",
      msg: "Slow",
      queue: "email",
      count: 3,
    });
  });

  test("writes an error with its type, message and stack under err", async () => {
    const { logger, records } = capture("info");

    await logger.error(
      { message: "It broke", requestId: "r-1" },
      new Error("db exploded"),
    );

    const entry = records()[0];
    expect(entry).toMatchObject({
      level: "error",
      msg: "It broke",
      requestId: "r-1",
    });
    expect(entry?.["err"]).toMatchObject({
      type: "Error",
      message: "db exploded",
    });
    expect(
      z.object({ stack: z.string() }).parse(entry?.["err"]).stack,
    ).toContain("db exploded");
  });

  test("hides secrets at the top level and one level down", async () => {
    const { logger, records } = capture("info");

    await logger.info({
      message: "Sign in",
      password: "hunter2",
      user: { token: "abc", apiKey: "sk-live", name: "Jane" },
      headers: { authorization: "Bearer x", cookie: "session=1" },
    });

    const entry = records()[0];
    expect(entry).toMatchObject({
      password: "[Redacted]",
      user: { token: "[Redacted]", apiKey: "[Redacted]", name: "Jane" },
      headers: { authorization: "[Redacted]", cookie: "[Redacted]" },
    });
  });

  test("drops entries below the configured level", async () => {
    const { logger, records } = capture("warn");

    await logger.debug("d");
    await logger.info("i");
    await logger.warn("w");
    await logger.error("e");

    expect(records().map((entry) => entry.msg)).toEqual(["w", "e"]);
  });

  test("writes nothing when silent", async () => {
    const { logger, records } = capture("silent");

    await logger.error("e", new Error("x"));

    expect(records()).toEqual([]);
  });

  test("a child logger adds its fields to every entry and keeps the level", async () => {
    const { logger, records } = capture("warn");
    const child = logger.child({ queue: "filter" });

    await child.info("quiet");
    await child.warn("loud");

    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ msg: "loud", queue: "filter" });
  });
});
