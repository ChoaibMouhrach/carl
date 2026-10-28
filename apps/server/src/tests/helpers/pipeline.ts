import type { DB } from "@server/infrastructure/database/client";
import {
  campaignsTable,
  pipelineRunsTable,
  type CampaignInsert,
  type PipelineRunInsert,
} from "@server/infrastructure/database/schemas";
import type {
  AddJobOptions,
  ConsumeMeta,
  QueueConsumer,
} from "@server/lib/base-queue";
import {
  BaseWebSearch,
  type WebSearchResult,
} from "@server/lib/base-web-search";
import { TestQueue } from "./context";

export class FakeWebSearch extends BaseWebSearch {
  public override readonly isAvailable = true;
  public queries: string[] = [];

  public constructor(
    private readonly respond: (query: string) => WebSearchResult[] = () => [],
  ) {
    super();
  }

  public override async search(input: {
    query: string;
  }): Promise<WebSearchResult[]> {
    this.queries.push(input.query);

    return this.respond(input.query);
  }
}

/** Hands jobs to the worker's consumer on demand, so a test picks the attempt metadata and sees the real error */
export class ManualQueue<Input> extends TestQueue<Input> {
  public failAddWith?: Error;
  private handler?: QueueConsumer<Input>;

  public constructor() {
    super({ process: async () => {} });
  }

  public override async add(
    input: Input,
    options?: AddJobOptions,
  ): Promise<void> {
    if (this.failAddWith) {
      throw this.failAddWith;
    }

    await super.add(input, options);
  }

  public override async consume(consumer: QueueConsumer<Input>): Promise<void> {
    this.handler = consumer;
  }

  public async deliver(
    input: Input,
    meta: ConsumeMeta = { isFinalAttempt: false },
  ): Promise<void> {
    if (!this.handler) {
      throw new Error("No worker is consuming this queue.");
    }

    await this.handler(input, meta);
  }
}

export const insertCampaign = async (
  db: DB,
  values: Partial<CampaignInsert> = {},
) => {
  const [campaign] = await db
    .insert(campaignsTable)
    .values({ name: "Fitness coaches", keyword: "fitness", ...values })
    .returning();

  if (!campaign) {
    throw new Error("The campaign was not inserted.");
  }

  return campaign;
};

export const insertRun = async (db: DB, values: PipelineRunInsert) => {
  const [run] = await db.insert(pipelineRunsTable).values(values).returning();

  if (!run) {
    throw new Error("The pipeline run was not inserted.");
  }

  return run;
};

export const runRows = async (db: DB) =>
  await db.select().from(pipelineRunsTable);
