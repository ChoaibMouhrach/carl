import { env } from "@/config/env";
import { liveEventTypes, type LiveEventType } from "@repo/constants/events";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const queryKeys: Record<LiveEventType, string> = {
  "campaigns.changed": "campaigns",
  "leads.changed": "leads",
  "communities.changed": "communities",
};

export const useLiveEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(`${env.VITE_API_URL}/api/events`, {
      withCredentials: true,
    });
    let hasConnected = false;

    const refresh = (type: LiveEventType) =>
      queryClient.invalidateQueries({
        queryKey: ["admin", queryKeys[type]],
      });

    // EventSource reconnects by itself; what changed while it was down is unknown
    source.addEventListener("ready", () => {
      if (hasConnected) liveEventTypes.forEach(refresh);
      hasConnected = true;
    });

    liveEventTypes.forEach((type) => {
      source.addEventListener(type, () => refresh(type));
    });

    return () => source.close();
  }, [queryClient]);
};
