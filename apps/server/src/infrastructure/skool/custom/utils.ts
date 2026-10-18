import type { SkoolPrice } from "@server/lib/base-skool-scraper";
import z from "zod";

export const emptyToNull = (value: string | undefined | null) =>
  value?.trim() || null;

export const toDate = (value: string | null | undefined) => {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Skool reports last_offline in nanoseconds since the epoch
export const nanosecondsToDate = (value: number | undefined) =>
  value ? new Date(value / 1_000_000) : null;

export const toPrice = (
  price: {
    currency: string;
    amount: number;
    recurring_interval?: SkoolPrice["interval"];
  } | null,
): SkoolPrice | null =>
  price && {
    currency: price.currency,
    amount: price.amount,
    interval: price.recurring_interval ?? null,
  };

export const jsonString = <Schema extends z.ZodType>(schema: Schema) =>
  z
    .string()
    .optional()
    .transform((raw): z.output<Schema> | null => {
      if (!raw) return null;

      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    })
    .catch(null);
