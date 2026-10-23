import type { RerunScope, StageNumber } from "@repo/constants/campaign";
import { BaseService } from "@server/lib/base-service";
import { EnrichService } from "./enrich";
import { FilterService } from "./filter";
import { FindEmailService } from "./find-email";

type RerunBody =
  | { stage: Extract<StageNumber, 2 | 3 | 4>; leadIds: number[] }
  | { stage: 4; scope: RerunScope };

export class RerunService extends BaseService {
  /** Sends the chosen leads back to a stage and runs it again for them, ignoring what they already have */
  public async start(input: { campaignId: number }, body: RerunBody) {
    const init = { context: this.context };

    if ("scope" in body) {
      return await new FindEmailService(init).start(input, {
        scope: body.scope,
      });
    }

    const options = { leadIds: [...new Set(body.leadIds)] };

    switch (body.stage) {
      case 2:
        return await new FilterService(init).start(input, options);
      case 3:
        return await new EnrichService(init).start(input, options);
      case 4:
        return await new FindEmailService(init).start(input, options);
    }
  }
}
