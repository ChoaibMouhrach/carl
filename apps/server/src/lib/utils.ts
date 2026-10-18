/**
 * @param delay number = 5000 (5s)
 */
export const sleep = (delay = 5000) => {
  return new Promise((resolve) => setTimeout(resolve, delay));
};

/**
 * Runs `task` over `items` with at most `concurrency` in flight.
 * Results keep the order of `items`.
 */
export const mapPool = async <Item, Result>(
  items: readonly Item[],
  concurrency: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> => {
  const results = new Array<Result>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]!, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
};

const emailPattern = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

export const extractEmails = (...texts: (string | null | undefined)[]) => {
  const emails = texts.flatMap((text) => text?.match(emailPattern) ?? []);

  return [...new Set(emails.map((email) => email.toLowerCase()))];
};
