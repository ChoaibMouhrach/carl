import type { StageNumber } from "@repo/constants/campaign";
import { BaseService } from "@server/lib/base-service";
import { EnrichService } from "./enrich";
import { FilterService } from "./filter";
import { FindEmailService } from "./find-email";

export class RerunService extends BaseService {
  /** Sends the chosen leads back to a stage and runs it again for them, ignoring what they already have */
  public async start(
    input: { campaignId: number },
    body: { stage: Extract<StageNumber, 2 | 3 | 4>; leadIds: number[] },
  ) {
    const options = { leadIds: [...new Set(body.leadIds)] };
    const init = { context: this.context };

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
