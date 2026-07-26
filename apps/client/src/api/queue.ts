import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class QueueApi extends BaseApi {
  public overview() {
    return this.call(() => http.api.queues.$get());
  }

  public listFailed(where: { queue: string; page?: number }) {
    return this.call(() =>
      http.api.queues[":queue"].failed.$get({
        param: { queue: where.queue },
        query: { page: where.page?.toString() },
      }),
    );
  }

  public retryJob(where: { queue: string; jobId: string }) {
    return this.call(() =>
      http.api.queues[":queue"].failed[":jobId"].retry.$post({
        param: { queue: where.queue, jobId: where.jobId },
      }),
    );
  }

  public retryAll(where: { queue: string }) {
    return this.call(() =>
      http.api.queues[":queue"].failed["retry-all"].$post({
        param: { queue: where.queue },
      }),
    );
  }

  public removeJob(where: { queue: string; jobId: string }) {
    return this.call(() =>
      http.api.queues[":queue"].failed[":jobId"].$delete({
        param: { queue: where.queue, jobId: where.jobId },
      }),
    );
  }
}
