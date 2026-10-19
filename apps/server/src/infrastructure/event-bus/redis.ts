import IORedis from "ioredis";
import { liveEventTypes } from "@repo/constants/events";
import {
  BaseEventBus,
  type LiveEventListener,
  type LiveEventType,
} from "@server/lib/base-event-bus";
import type { BaseLogger } from "@server/lib/base-logger";

const CHANNEL = "carl:events";

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
        void this.logger.info({ eventBusError: error.message });
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
          void this.logger.info({
            eventBusError:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    void this.subscriber.subscribe(CHANNEL).catch((error: Error) => {
      void this.logger.info({ eventBusError: error.message });
    });
  }

  public override async publish(...types: LiveEventType[]): Promise<void> {
    try {
      await Promise.all(
        types.map((type) => this.publisher.publish(CHANNEL, type)),
      );
    } catch (error) {
      await this.logger.info({
        eventBusError: error instanceof Error ? error.message : String(error),
      });
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
