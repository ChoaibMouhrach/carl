import { parseArgs } from "node:util";
import { initContext } from "../context";
import {
  skoolPriceFilters,
  skoolVisibilities,
} from "../lib/base-skool-scraper";
import { buildSearches } from "../lib/skool-discovery";
import { Services } from "../services";

const { values } = parseArgs({
  options: {
    keyword: { type: "string" },
    type: { type: "string", multiple: true },
    pricing: { type: "string", multiple: true },
    "min-price": { type: "string" },
    "max-price": { type: "string" },
    "min-members": { type: "string" },
    "max-members": { type: "string" },
    "discovery-concurrency": { type: "string" },
    "community-concurrency": { type: "string" },
  },
});

const parseAll = <Value extends string>(
  flag: string,
  allowed: readonly Value[],
  inputs: string[] | undefined,
): Value[] | undefined => {
  if (!inputs) return undefined;

  return inputs.map((input) => {
    const value = allowed.find((item) => item === input);

    if (!value) {
      console.error(`Invalid --${flag} "${input}". Use ${allowed.join("|")}`);
      process.exit(1);
    }

    return value;
  });
};

const parseNumber = (value: string | undefined) =>
  value === undefined ? undefined : Number(value);

const run = async () => {
  if (!values.keyword) {
    console.error(
      'Usage: bun run scrape --keyword "business coaching" [--type public --pricing paid --min-price 10 --max-price 100 --min-members 50 --max-members 5000 ...]',
    );
    process.exit(1);
  }

  const context = await initContext();
  const services = new Services({ context });

  const startedAt = performance.now();
  const { summary } = await services.scrape.run({
    keyword: values.keyword,
    searches: buildSearches(
      parseAll("type", skoolVisibilities, values.type) ?? skoolVisibilities,
      parseAll("pricing", skoolPriceFilters, values.pricing) ??
        skoolPriceFilters,
    ),
    filters: {
      minMonthlyPriceUsd: parseNumber(values["min-price"]),
      maxMonthlyPriceUsd: parseNumber(values["max-price"]),
      minMembers: parseNumber(values["min-members"]),
      maxMembers: parseNumber(values["max-members"]),
    },
    discoveryConcurrency: values["discovery-concurrency"]
      ? Number(values["discovery-concurrency"])
      : undefined,
    communityConcurrency: values["community-concurrency"]
      ? Number(values["community-concurrency"])
      : undefined,
  });
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

  console.log(
    JSON.stringify({ ...summary, failures: summary.failures.length }, null, 2),
  );
  for (const failure of summary.failures) {
    console.log(`failed: ${failure.target}: ${failure.reason}`);
  }
  console.log(`done in ${seconds}s`);

  await context.queueHub.close();
  await context.eventBus.close();
  await context.rateLimiter.close();
  await context.repositories.close();
};

await run();
process.exit(0);
