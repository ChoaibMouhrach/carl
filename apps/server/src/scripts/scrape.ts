import { parseArgs } from "node:util";
import { initContext } from "../context";
import {
  skoolPriceFilters,
  skoolVisibilities,
} from "../lib/base-skool-scraper";
import { Services } from "../services";

const { values } = parseArgs({
  options: {
    keyword: { type: "string" },
    search: { type: "string", multiple: true },
    "discovery-concurrency": { type: "string" },
    "community-concurrency": { type: "string" },
  },
});

const parseSearch = (search: string) => {
  const [visibility, price] = search.split(":");
  const parsedVisibility = skoolVisibilities.find(
    (item) => item === visibility,
  );
  const parsedPrice = skoolPriceFilters.find((item) => item === price);

  if (!parsedVisibility || !parsedPrice) {
    console.error(
      `Invalid --search "${search}". Use <${skoolVisibilities.join("|")}>:<${skoolPriceFilters.join("|")}>`,
    );
    process.exit(1);
  }

  return { visibility: parsedVisibility, price: parsedPrice };
};

const run = async () => {
  if (!values.keyword) {
    console.error(
      'Usage: bun run scrape --keyword "business coaching" [--search public:paid ...]',
    );
    process.exit(1);
  }

  const context = await initContext();
  const services = new Services({ context });

  const startedAt = performance.now();
  const { summary } = await services.scrape.run({
    keyword: values.keyword,
    searches: values.search?.map(parseSearch),
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
  await context.rateLimiter.close();
  await context.repositories.close();
};

await run();
process.exit(0);
