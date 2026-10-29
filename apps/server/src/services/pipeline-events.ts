import type { Context } from "@server/context";
import { pipelineTopic } from "@server/lib/base-pubsub";
import { describeError } from "@server/lib/utils";

export const publishPipelineChanged = async (
  context: Context,
  campaignId: number,
): Promise<void> => {
  try {
    await context.pubSub.pipeline.publish(pipelineTopic(campaignId), {
      campaignId,
    });
  } catch (error) {
    void context.logger.warn({
      message: "Could not publish the pipeline change.",
      campaignId,
      error: describeError(error),
    });
  }
};
