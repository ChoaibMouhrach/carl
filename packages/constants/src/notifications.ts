export const notificationTypes = [
  "billing.payment_failed",
  "billing.subscription_canceled",
  "billing.subscription_ended",
  "billing.subscription_resumed",
  "billing.plan_upgraded",
  "billing.plan_downgrade_scheduled",
  "billing.trial_ending",
  "billing.renewed",
  "job.completed",
  "job.failed",
  "credits.low",
  "credits.exhausted",
  "account.email_changed",
  "account.password_changed",
  "team.invite",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const isNotificationType = (value: string): value is NotificationType =>
  notificationTypes.some((type) => type === value);
