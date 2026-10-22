import type { ENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import { BaseLogger } from "@server/lib/base-logger";
import { BaseMailer, type SendEmailProps } from "@server/lib/base-mailer";
import {
  BaseQueue,
  BaseQueueHub,
  type AddJobOptions,
  type EmailJob,
  type FailedJob,
  type ListFailedInput,
  type ListFailedResult,
  type MaintenanceJob,
  type EnrichJob,
  type FilterJob,
  type ScrapeJob,
  type QueueConsumer,
  type QueueJobCounts,
  type RegisteredQueue,
  type ScheduleJobOptions,
} from "@server/lib/base-queue";
import { BaseCache } from "@server/lib/base-cache";
import {
  BaseLeadClassifier,
  type ClassifierInput,
  type ClassifierOutput,
} from "@server/lib/base-lead-classifier";
import {
  BaseWebSearch,
  type WebSearchInput,
  type WebSearchResult,
} from "@server/lib/base-web-search";
import { BaseEventBus } from "@server/lib/base-event-bus";
import type {
  LiveEventListener,
  LiveEventType,
} from "@server/lib/base-event-bus";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";
import { Repositories } from "@server/repositories";
import { DisabledErrorMonitor } from "@server/infrastructure/error-monitor/disabled";
import type { AppContext, AuthAppContext } from "@server/app";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { createAuth } from "@server/infrastructure/auth";
import type { BaseSkoolScraper } from "@server/lib/base-skool-scraper";
import { CustomSkoolScraper } from "@server/infrastructure/skool/custom";
import { DEFAULT_SKOOL_SEARCHES } from "@server/config/constants";

export interface LogRecord {
  level: "debug" | "info" | "warn" | "error";
  message: string | object;
  error?: unknown;
}

export class TestLogger extends BaseLogger {
  public records: LogRecord[] = [];

  public get entries() {
    return this.records
      .filter((record) => record.level === "info")
      .map((record) => record.message);
  }

  public override async debug(message: string | object): Promise<void> {
    this.records.push({ level: "debug", message });
  }

  public override async info(message: string | object): Promise<void> {
    this.records.push({ level: "info", message });
  }

  public override async warn(message: string | object): Promise<void> {
    this.records.push({ level: "warn", message });
  }

  public override async error(
    message: string | object,
    error?: unknown,
  ): Promise<void> {
    this.records.push({ level: "error", message, error });
  }

  public override child(): BaseLogger {
    return this;
  }
}

export class TestMailer extends BaseMailer {
  public emails: SendEmailProps<string>[] = [];
  public emailsSent = 0;
  public sentAt: number[] = [];
  public shouldFail = false;
  public verifyShouldFail = false;

  public override async email<From extends string>(
    props: SendEmailProps<From>,
  ): Promise<void> {
    this.emails.push(props);
    this.emailsSent += 1;
    this.sentAt.push(Date.now());

    if (this.shouldFail) {
      throw new Error("Test mailer failed.");
    }
  }

  public override async verify(): Promise<void> {
    if (this.verifyShouldFail) {
      throw new Error("Test mailer verification failed.");
    }
  }
}

interface TestJob<Input> {
  id: string;
  data: Input;
  attemptsMade: number;
  failedReason: string | null;
  status: "completed" | "failed";
}

export class TestQueue<Input> extends BaseQueue<Input> {
  public waiting = 0;
  private consumer?: QueueConsumer<Input>;
  private process: (input: Input) => Promise<void>;
  private jobs = new Map<string, TestJob<Input>>();
  private counter = 0;

  public constructor(init: { process: (input: Input) => Promise<void> }) {
    super();
    this.process = init.process;
  }

  public override async add(
    input: Input,
    options?: AddJobOptions,
  ): Promise<void> {
    const id = options?.idempotencyKey ?? `job-${(this.counter += 1)}`;

    if (this.jobs.has(id)) return;

    const job: TestJob<Input> = {
      id,
      data: input,
      attemptsMade: 0,
      failedReason: null,
      status: "completed",
    };
    this.jobs.set(id, job);
    await this.runJob(job);
  }

  public override async schedule(
    _options: ScheduleJobOptions<Input>,
  ): Promise<void> {}

  public override async consume(consumer: QueueConsumer<Input>): Promise<void> {
    this.consumer = consumer;
  }

  public override async getCounts(): Promise<QueueJobCounts> {
    const failed = this.failedJobs().length;

    return {
      waiting: this.waiting,
      active: 0,
      completed: this.jobs.size - failed,
      failed,
      delayed: 0,
      paused: 0,
    };
  }

  public override async listFailed(
    input: ListFailedInput,
  ): Promise<ListFailedResult> {
    const failed = this.failedJobs();

    return {
      jobs: failed.slice(input.start, input.end + 1).map(toTestFailedJob),
      total: failed.length,
    };
  }

  public override async retry(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);

    if (!job) return false;

    await this.runJob(job);

    return true;
  }

  public override async retryAllFailed(): Promise<number> {
    const failed = this.failedJobs();

    for (const job of failed) {
      await this.runJob(job);
    }

    return failed.length;
  }

  public override async remove(jobId: string): Promise<boolean> {
    return this.jobs.delete(jobId);
  }

  public override async close(): Promise<void> {}

  private failedJobs(): TestJob<Input>[] {
    return [...this.jobs.values()].filter((job) => job.status === "failed");
  }

  private async runJob(job: TestJob<Input>): Promise<void> {
    const handler = this.consumer ?? this.process;
    job.attemptsMade += 1;

    try {
      await handler(job.data);
      job.status = "completed";
      job.failedReason = null;
    } catch (error) {
      job.status = "failed";
      job.failedReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

const toTestFailedJob = <Input>(job: TestJob<Input>): FailedJob => ({
  id: job.id,
  name: "send",
  data: job.data,
  failedReason: job.failedReason ?? "",
  attemptsMade: job.attemptsMade,
  timestamp: 0,
  processedOn: null,
  stacktrace: [],
});

export class TestQueueHub extends BaseQueueHub {
  public email: TestQueue<EmailJob>;
  public maintenance: TestQueue<MaintenanceJob>;
  public scrape: TestQueue<ScrapeJob>;
  public filter: TestQueue<FilterJob>;
  public enrich: TestQueue<EnrichJob>;

  public constructor(init: { mailer: BaseMailer }) {
    super();
    this.email = new TestQueue<EmailJob>({
      process: async (input) => {
        await init.mailer.email(input);
      },
    });
    this.maintenance = new TestQueue<MaintenanceJob>({
      process: async () => {},
    });
    this.scrape = new TestQueue<ScrapeJob>({
      process: async () => {},
    });
    this.filter = new TestQueue<FilterJob>({
      process: async () => {},
    });
    this.enrich = new TestQueue<EnrichJob>({
      process: async () => {},
    });
  }

  public override queues(): RegisteredQueue[] {
    return [
      { name: "email", queue: this.email },
      { name: "maintenance", queue: this.maintenance },
      { name: "scrape", queue: this.scrape },
      { name: "filter", queue: this.filter },
      { name: "enrich", queue: this.enrich },
    ];
  }

  public override async close(): Promise<void> {}
}

export class FakeLeadClassifier extends BaseLeadClassifier {
  public provider = "fake";
  public model = "fake";
  public calls: ClassifierInput[] = [];
  public error: Error | null = null;
  public inFlight = 0;
  public peakInFlight = 0;
  public delayMs = 0;
  /** Decides the answers; by default every requirement and evidence question is a yes quoting the first line of the facts and every competitor or disqualifier question is a no */
  public answer: (input: ClassifierInput) => ClassifierOutput = (input) => ({
    answers: input.questions.map((question) =>
      question.role === "competitor" || question.role === "disqualifier"
        ? { questionId: question.questionId, answer: "no", evidence: null }
        : {
            questionId: question.questionId,
            answer: "yes",
            evidence: input.facts.split("\n")[0] ?? null,
          },
    ),
    summary: "Looks like a fit.",
    model: "fake",
  });

  public override async classify(input: ClassifierInput) {
    this.calls.push(input);
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);

    try {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }

      if (this.error) throw this.error;

      return this.answer(input);
    } finally {
      this.inFlight -= 1;
    }
  }
}

export class TestCache extends BaseCache {
  public entries = new Map<string, string>();
  public ttls = new Map<string, number>();

  public async get(key: string) {
    return this.entries.get(key) ?? null;
  }

  public async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, value);
    this.ttls.set(key, ttlSeconds);
  }

  public async close() {}
}

export class FakeWebSearch extends BaseWebSearch {
  public readonly provider = "fake";

  public calls: WebSearchInput[] = [];
  public error: Error | null = null;
  public inFlight = 0;
  public peakInFlight = 0;
  public delayMs = 0;
  /** Decides the results; by default nothing is found */
  public answer: (input: WebSearchInput) => WebSearchResult[] = () => [];

  public override async search(input: WebSearchInput) {
    this.calls.push(input);
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);

    try {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }

      if (this.error) throw this.error;

      return this.answer(input);
    } finally {
      this.inFlight -= 1;
    }
  }
}

export class TestEventBus extends BaseEventBus {
  public published: LiveEventType[] = [];
  private listeners = new Set<LiveEventListener>();

  public get listenerCount() {
    return this.listeners.size;
  }

  public override async publish(...types: LiveEventType[]): Promise<void> {
    for (const type of types) {
      this.published.push(type);

      for (const listener of this.listeners) {
        listener(type);
      }
    }
  }

  public override subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public override async close(): Promise<void> {}
}

class TestRateLimiter extends BaseRateLimiter {
  public anonymous: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authEmail: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authIp: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authenticated: MiddlewareHandler<AuthAppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };
  public platformSetup: MiddlewareHandler<AppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };

  public override async ping(): Promise<void> {}

  public override async close(): Promise<void> {}
}

export const createContext = (
  db: DB,
  pool: Pool,
  env: ENV,
  mailer: BaseMailer = new TestMailer(),
  rateLimiter: BaseRateLimiter = new TestRateLimiter(),
  skoolScraper: BaseSkoolScraper = new CustomSkoolScraper(),
  leadClassifier: FakeLeadClassifier = new FakeLeadClassifier(),
  webSearch: FakeWebSearch = new FakeWebSearch(),
): Context & {
  eventBus: TestEventBus;
  cache: TestCache;
  leadClassifier: FakeLeadClassifier;
  webSearch: FakeWebSearch;
} => {
  const queueHub = new TestQueueHub({ mailer });

  return {
    auth: createAuth({ db, env, queueHub }),
    env,
    errorMonitor: new DisabledErrorMonitor(),
    logger: new TestLogger(),
    mailer,
    queueHub,
    eventBus: new TestEventBus(),
    cache: new TestCache(),
    rateLimiter,
    repositories: new Repositories({ dbConnection: { db, pool } }),
    skoolScraper,
    leadClassifier,
    webSearch,
    eventStreamHeartbeatMs: 50,
    discoveryCriteria: DEFAULT_SKOOL_SEARCHES,
  };
};
