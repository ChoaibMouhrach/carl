export interface PipelineEvent {
  campaignId: number;
}

export type PubSubHandler<Message> = (message: Message) => void;

export abstract class BasePubSub<Message> {
  public abstract publish(topic: string, message: Message): Promise<void>;

  /** Resolves once the subscription is active; the result stops it */
  public abstract subscribe(
    topic: string,
    handler: PubSubHandler<Message>,
  ): Promise<() => Promise<void>>;
}

export abstract class BasePubSubHub {
  public abstract pipeline: BasePubSub<PipelineEvent>;

  public abstract close(): Promise<void>;
}

export const pipelineTopic = (campaignId: number) =>
  `pipeline:campaign:${campaignId}`;
