import { BaseService } from "@server/lib/base-service";
import type { LiveEventListener } from "@server/lib/base-event-bus";

export class EventService extends BaseService {
  public subscribe(listener: LiveEventListener): () => void {
    return this.context.eventBus.subscribe(listener);
  }
}
