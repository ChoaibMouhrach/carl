import IORedis from "ioredis";
import z from "zod";
import {
  BasePubSub,
  BasePubSubHub,
  type PipelineEvent,
  type PubSubHandler,
} from "../../lib/base-pubsub";

const pipelineEventSchema = z.object({ campaignId: z.number() });

interface RedisPubSubInit<Message> {
  publisher: IORedis;
  subscriber: IORedis;
  schema: z.ZodType<Message>;
}

class RedisPubSub<Message> extends BasePubSub<Message> {
  private publisher: IORedis;
  private subscriber: IORedis;
  private schema: z.ZodType<Message>;
  private handlers = new Map<string, Set<PubSubHandler<Message>>>();

  public constructor(init: RedisPubSubInit<Message>) {
    super();
    this.publisher = init.publisher;
    this.subscriber = init.subscriber;
    this.schema = init.schema;

    this.subscriber.on("message", (topic, payload) => {
      const handlers = this.handlers.get(topic);
      if (!handlers) return;

      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        return;
      }

      const parsed = this.schema.safeParse(json);
      if (!parsed.success) return;

      for (const handler of handlers) handler(parsed.data);
    });
  }

  public override async publish(topic: string, message: Message) {
    await this.publisher.publish(topic, JSON.stringify(message));
  }

  public override async subscribe(
    topic: string,
    handler: PubSubHandler<Message>,
  ) {
    const existing = this.handlers.get(topic);
    const handlers = existing ?? new Set<PubSubHandler<Message>>();
    handlers.add(handler);
    this.handlers.set(topic, handlers);

    if (!existing) await this.subscriber.subscribe(topic);

    return async () => {
      handlers.delete(handler);
      if (handlers.size > 0) return;

      this.handlers.delete(topic);
      await this.subscriber.unsubscribe(topic);
    };
  }
}

export class RedisPubSubHub extends BasePubSubHub {
  public pipeline: BasePubSub<PipelineEvent>;
  private publisher: IORedis;
  private subscriber: IORedis;

  public constructor(init: { redisUrl: string }) {
    super();
    this.publisher = new IORedis(init.redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = new IORedis(init.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.pipeline = new RedisPubSub({
      publisher: this.publisher,
      subscriber: this.subscriber,
      schema: pipelineEventSchema,
    });
  }

  public override async close(): Promise<void> {
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}
