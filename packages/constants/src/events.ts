export const liveEventTypes = [
  "campaigns.changed",
  "leads.changed",
  "communities.changed",
] as const;

export type LiveEventType = (typeof liveEventTypes)[number];
