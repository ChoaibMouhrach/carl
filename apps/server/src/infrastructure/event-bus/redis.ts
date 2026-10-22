import IORedis from "ioredis";
import { liveEventTypes } from "@repo/constants/events";
import {
  BaseEventBus,
  type LiveEventListener,
  type LiveEventType,
} from "@server/lib/base-event-bus";
import type { BaseLogger } from "@server/lib/base-logger";

const CHANNEL = "carl:events";
const PUBLISH_TIMEOUT_MS = 1_000;

interface RedisEventBusInit {
  logger: BaseLogger;
  redisUrl: string;
}

const toEventType = (message: string): LiveEventType | undefined =>
  liveEventTypes.find((type) => type === message);

export class RedisEventBus extends BaseEventBus {
  private logger: BaseLogger;
  private publisher: IORedis;
  private subscriber: IORedis;
  private listeners = new Set<LiveEventListener>();

  public constructor(init: RedisEventBusInit) {
    super();

    this.logger = init.logger;
    this.publisher = new IORedis(init.redisUrl);
    // A connection in subscriber mode can't run other commands
    this.subscriber = new IORedis(init.redisUrl);

    for (const connection of [this.publisher, this.subscriber]) {
      connection.on("error", (error) => {
        void this.logger.error(
          { message: "Event bus connection error." },
          error,
        );
      });
    }

    this.subscriber.on("message", (_channel, message) => {
      const type = toEventType(message);

      if (!type) return;

      for (const listener of this.listeners) {
        // One broken listener must not starve the others or reach the Redis client
        try {
          listener(type);
        } catch (error) {
          void this.logger.error(
            { message: "An event bus listener failed." },
            error,
          );
        }
      }
    });

    void this.subscriber.subscribe(CHANNEL).catch((error: Error) => {
      void this.logger.error({ message: "Event bus subscribe failed." }, error);
    });
  }

  public override async publish(...types: LiveEventType[]): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A request must not wait on Redis: past the timeout the event is dropped
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Publishing the event timed out")),
        PUBLISH_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([
        Promise.all(types.map((type) => this.publisher.publish(CHANNEL, type))),
        timeout,
      ]);
    } catch (error) {
      await this.logger.error({ message: "Event bus publish failed." }, error);
    } finally {
      clearTimeout(timer);
    }
  }

  public override subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public override async close(): Promise<void> {
    this.listeners.clear();
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
