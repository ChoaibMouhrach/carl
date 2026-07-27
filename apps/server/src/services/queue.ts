import { BaseService } from "@server/lib/base-service";
import { NotFoundError } from "@server/lib/errors";
import type { RegisteredQueue } from "@server/lib/base-queue";

const queueFailedPageSize = 20;

export class QueueService extends BaseService {
  public async overview() {
    const registered = this.context.queueHub.queues();

    const queues = await Promise.all(
      registered.map(async (entry) => ({
        name: entry.name,
        counts: await entry.queue.getCounts(),
      })),
    );

    return { queues };
  }

  public async getBacklogged(input: { threshold: number }) {
    const registered = this.context.queueHub.queues();

    const backlogged = await Promise.all(
      registered.map(async (entry) => ({
        name: entry.name,
        counts: await entry.queue.getCounts(),
      })),
    );

    return backlogged.filter(
      (entry) => entry.counts.waiting >= input.threshold,
    );
  }

  public async listFailed(input: { queue: string; page: number }) {
    const { queue } = this.findQueue(input.queue);

    const start = (input.page - 1) * queueFailedPageSize;
    const end = start + queueFailedPageSize - 1;
    const { jobs, total } = await queue.listFailed({ start, end });

    return {
      jobs,
      meta: {
        page: input.page,
        lastPage: Math.max(1, Math.ceil(total / queueFailedPageSize)),
      },
    };
  }

  public async retryJob(input: {
    queue: string;
    jobId: string;
  }): Promise<void> {
    const { queue } = this.findQueue(input.queue);

    const retried = await queue.retry(input.jobId);

    if (!retried) {
      throw new NotFoundError({ message: "Job not found." });
    }
  }

  public async retryAll(input: { queue: string }): Promise<{ count: number }> {
    const { queue } = this.findQueue(input.queue);

    const count = await queue.retryAllFailed();

    return { count };
  }

  public async removeJob(input: {
    queue: string;
    jobId: string;
  }): Promise<void> {
    const { queue } = this.findQueue(input.queue);

    const removed = await queue.remove(input.jobId);

    if (!removed) {
      throw new NotFoundError({ message: "Job not found." });
    }
  }

  private findQueue(name: string): RegisteredQueue {
    const entry = this.context.queueHub
      .queues()
      .find((queue) => queue.name === name);

    if (!entry) {
      throw new NotFoundError({ message: "Queue not found." });
    }

    return entry;
  }
}
