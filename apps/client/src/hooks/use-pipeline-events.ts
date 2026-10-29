import { api } from "@/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

export const usePipelineEvents = (campaignId: number) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const events = api.campaign.pipelineEvents({ campaignId });

    events.onmessage = (event: MessageEvent<string>) => {
      const state: PipelineState = JSON.parse(event.data);

      queryClient.setQueryData(
        ["admin", "campaigns", campaignId, "pipeline"],
        state,
      );
    };

    return () => events.close();
  }, [campaignId, queryClient]);
};
