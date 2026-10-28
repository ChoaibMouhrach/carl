import type { Context } from "@server/context";

export abstract class BaseService {
  protected context;

  public constructor(init: { context: Context }) {
    this.context = init.context;
  }
}
