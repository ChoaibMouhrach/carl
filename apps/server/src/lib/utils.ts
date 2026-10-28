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

/**
 * Runs the task at most once per interval: the first call runs at once and calls in
 * between collapse into one trailing run, so a burst still ends on its latest state.
 */
export const createThrottle = (
  task: () => Promise<void>,
  intervalMs: number,
) => {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    timer = undefined;
    lastRun = Date.now();
    await task();
  };

  return {
    call: () => {
      if (timer) return;

      const wait = Math.max(0, lastRun + intervalMs - Date.now());

      if (wait === 0) {
        void run();
        return;
      }

      timer = setTimeout(() => void run(), wait);
    },
    stop: () => {
      clearTimeout(timer);
      timer = undefined;
    },
  };
};

const emailPattern = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

export const extractEmails = (...texts: (string | null | undefined)[]) => {
  const emails = texts.flatMap((text) => text?.match(emailPattern) ?? []);

  return [...new Set(emails.map((email) => email.toLowerCase()))];
};

/** A LIKE pattern matching `text` literally, so a typed % or _ is not a wildcard */
export const containsPattern = (text: string) =>
  `%${text.replace(/[\\%_]/g, "\\$&")}%`;

/** Escapes `%`, `_` and `\` so user input matches literally inside a LIKE pattern */
export const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const MAX_ERROR_LENGTH = 500;

export const describeError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "Unknown error";

  return message.slice(0, MAX_ERROR_LENGTH);
};
