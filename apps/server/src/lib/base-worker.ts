import type { Context } from "@server/context";

interface BaseWorkerInit {
  context: Context;
}

export abstract class BaseWorker {
  protected context: Context;

  public constructor(init: BaseWorkerInit) {
    this.context = init.context;
  }

  public abstract run(): Promise<void>;
}
