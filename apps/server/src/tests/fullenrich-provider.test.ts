import { expect, test } from "bun:test";
import type { LeadEmailStatus } from "@repo/constants/lead-emails";
import { FullEnrichContactEnrichment } from "@server/infrastructure/contact-enrichment/fullenrich";
import {
  ContactEnrichmentError,
  type ContactEnrichmentResult,
} from "@server/lib/base-contact-enrichment";
import { finishedContact, withFullEnrichApi } from "./helpers/fullenrich-api";

const input = { firstName: "Ann", lastName: "Coach", domain: "anncoach.com" };

const provider = () =>
  new FullEnrichContactEnrichment({
    apiKey: "test-key",
    initialDelayMs: 0,
    pollIntervalMs: 0,
  });

const lookup = async (
  contactInfo: Record<string, unknown>,
): Promise<ContactEnrichmentResult> => {
  let result: ContactEnrichmentResult | undefined;

  await withFullEnrichApi([finishedContact(contactInfo)], async () => {
    result = await provider().enrich(input);
  });

  if (!result) throw new Error("The lookup returned nothing.");

  return result;
};

const statusCases: {
  name: string;
  email: { email: string; status?: string };
  expected: LeadEmailStatus;
}[] = [
  {
    name: "DELIVERABLE",
    email: { email: "ann@anncoach.com", status: "DELIVERABLE" },
    expected: "deliverable",
  },
  {
    name: "HIGH_PROBABILITY",
    email: { email: "ann@anncoach.com", status: "HIGH_PROBABILITY" },
    expected: "highProbability",
  },
  {
    name: "CATCH_ALL",
    email: { email: "ann@anncoach.com", status: "CATCH_ALL" },
    expected: "catchAll",
  },
  {
    name: "a status FullEnrich did not send",
    email: { email: "ann@anncoach.com" },
    expected: "unknown",
  },
  {
    name: "a status this app does not know yet",
    email: { email: "ann@anncoach.com", status: "SOMETHING_NEW" },
    expected: "unknown",
  },
];

for (const scenario of statusCases) {
  test(`${scenario.name} is returned as ${scenario.expected} with its address`, async () => {
    const result = await lookup({
      most_probable_work_email: scenario.email,
      work_emails: [scenario.email],
    });

    expect(result).toEqual({
      workEmail: { address: "ann@anncoach.com", status: scenario.expected },
      personalEmail: null,
    });
  });
}

test("work and personal emails each keep their own status", async () => {
  const result = await lookup({
    most_probable_work_email: {
      email: "ann@anncoach.com",
      status: "CATCH_ALL",
    },
    most_probable_personal_email: {
      email: "ann@gmail.com",
      status: "DELIVERABLE",
    },
  });

  expect(result).toEqual({
    workEmail: { address: "ann@anncoach.com", status: "catchAll" },
    personalEmail: { address: "ann@gmail.com", status: "deliverable" },
  });
});

const unusableStatuses = ["INVALID", "INVALID_DOMAIN"];

for (const unusable of unusableStatuses) {
  test(`an ${unusable} best guess is skipped for the next usable email with its own status`, async () => {
    const result = await lookup({
      most_probable_work_email: { email: "bad@anncoach.com", status: unusable },
      work_emails: [
        { email: "bad@anncoach.com", status: unusable },
        { email: "ann@anncoach.com", status: "HIGH_PROBABILITY" },
      ],
    });

    expect(result.workEmail).toEqual({
      address: "ann@anncoach.com",
      status: "highProbability",
    });
  });

  test(`when every email is ${unusable} nothing is returned for that kind`, async () => {
    const result = await lookup({
      most_probable_work_email: { email: "bad@anncoach.com", status: unusable },
      work_emails: [{ email: "bad@anncoach.com", status: unusable }],
      most_probable_personal_email: {
        email: "bad@gmail.com",
        status: unusable,
      },
    });

    expect(result).toEqual({ workEmail: null, personalEmail: null });
  });
}

test("an empty address is never returned, even with a good status", async () => {
  const result = await lookup({
    most_probable_work_email: { email: "", status: "DELIVERABLE" },
    work_emails: [{ email: "", status: "DELIVERABLE" }],
  });

  expect(result.workEmail).toBeNull();
});

test("a finished lookup with no contact info returns nothing", async () => {
  await withFullEnrichApi([{ status: "FINISHED", data: [] }], async () => {
    expect(await provider().enrich(input)).toEqual({
      workEmail: null,
      personalEmail: null,
    });
  });
});

test("a lookup starts once, polls until finished and only talks to FullEnrich with the key", async () => {
  await withFullEnrichApi(
    [
      { status: "IN_PROGRESS", data: [] },
      finishedContact({
        most_probable_work_email: {
          email: "ann@anncoach.com",
          status: "DELIVERABLE",
        },
      }),
    ],
    async (calls) => {
      const result = await provider().enrich(input);

      expect(result.workEmail).toEqual({
        address: "ann@anncoach.com",
        status: "deliverable",
      });
      expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
        "POST https://app.fullenrich.com/api/v2/contact/enrich/bulk",
        "GET https://app.fullenrich.com/api/v2/contact/enrich/bulk/enrichment-1",
        "GET https://app.fullenrich.com/api/v2/contact/enrich/bulk/enrichment-1",
      ]);
      expect(calls.map((call) => call.authorization)).toEqual([
        "Bearer test-key",
        "Bearer test-key",
        "Bearer test-key",
      ]);
    },
  );
});

test("a lookup that ran out of FullEnrich credits fails for good and returns no email", async () => {
  await withFullEnrichApi(
    [{ status: "CREDITS_INSUFFICIENT", data: [] }],
    async (calls) => {
      const error = await provider()
        .enrich(input)
        .then(
          () => null,
          (reason: unknown) => reason,
        );

      expect(error).toBeInstanceOf(ContactEnrichmentError);
      expect(error).toMatchObject({ retryable: false });
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    },
  );
});

test("a lead FullEnrich cannot identify never reaches the network", async () => {
  await withFullEnrichApi([], async (calls) => {
    await expect(
      provider().enrich({ firstName: "Cher", lastName: "" }),
    ).rejects.toBeInstanceOf(ContactEnrichmentError);

    expect(calls).toEqual([]);
  });
});
