import { spyOn } from "bun:test";

const API = "https://app.fullenrich.com/api/v2";

export interface FullEnrichCall {
  method: string;
  url: string;
  authorization: string | null;
}

export const finishedContact = (contactInfo: Record<string, unknown>) => ({
  status: "FINISHED",
  data: [{ contact_info: contactInfo }],
});

/** Replaces the network for one callback: only FullEnrich's own paths answer, anything else throws, so no test can reach a paid API */
export const withFullEnrichApi = async (
  results: Record<string, unknown>[],
  callback: (calls: FullEnrichCall[]) => Promise<void>,
): Promise<void> => {
  const calls: FullEnrichCall[] = [];
  const pending = [...results];
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    async (input, init) => {
      const url =
        input instanceof Request ? input.url : new URL(input).toString();
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url,
        authorization: new Headers(init?.headers).get("authorization"),
      });

      if (!url.startsWith(`${API}/`)) {
        throw new Error(`A test reached the network: ${method} ${url}`);
      }
      if (method === "POST") {
        return Response.json({ enrichment_id: "enrichment-1" });
      }

      const next = pending.shift();
      if (!next) {
        throw new Error(`FullEnrich was polled more than expected: ${url}`);
      }
      return Response.json(next);
    },
  );

  try {
    await callback(calls);
  } finally {
    spy.mockRestore();
  }
};
