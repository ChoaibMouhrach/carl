import { hostname } from "node:os";
import pino, { type DestinationStream, type Logger } from "pino";
import type { LogLevel } from "@server/config/constants";
import { BaseLogger } from "@server/lib/base-logger";

const REDACTED_KEYS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
];

const redactPaths = REDACTED_KEYS.flatMap((key) => [key, `*.${key}`]);

interface PinoLoggerInit {
  level: LogLevel;
  destination?: DestinationStream;
  logger?: Logger;
}

const split = (input: string | object) => {
  if (typeof input === "string") return { fields: {}, message: input };

  const { message, ...fields }: { message?: unknown } = input;

  return {
    fields,
    message: typeof message === "string" ? message : undefined,
  };
};

export class PinoLogger extends BaseLogger {
  private readonly level: LogLevel;
  private readonly logger: Logger;

  public constructor(init: PinoLoggerInit) {
    super();

    this.level = init.level;
    this.logger =
      init.logger ??
      pino(
        {
          level: init.level,
          base: { service: "carl-server", hostname: hostname() },
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: { level: (label) => ({ level: label }) },
          redact: { paths: redactPaths, censor: "[Redacted]" },
        },
        init.destination,
      );
  }

  public override async debug(input: string | object) {
    const { fields, message } = split(input);

    this.logger.debug(fields, message);
  }

  public override async info(input: string | object) {
    const { fields, message } = split(input);

    this.logger.info(fields, message);
  }

  public override async warn(input: string | object) {
    const { fields, message } = split(input);

    this.logger.warn(fields, message);
  }

  public override async error(input: string | object, error?: unknown) {
    const { fields, message } = split(input);

    this.logger.error({ ...fields, err: error }, message);
  }

  public override child(bindings: Record<string, unknown>): BaseLogger {
    return new PinoLogger({
      level: this.level,
      logger: this.logger.child(bindings),
    });
  }
}

export const createPinoLogger = async (init: {
  level: LogLevel;
  pretty: boolean;
}) => {
  if (!init.pretty) return new PinoLogger({ level: init.level });

  const { default: pretty } = await import("pino-pretty");

  return new PinoLogger({
    level: init.level,
    destination: pretty({ colorize: true, ignore: "service,hostname" }),
  });
};
