import { expect, test } from "bun:test";
import type { LeadEmailVerification } from "@repo/constants/lead-emails";
import {
  ApifyEmailVerifier,
  type ActorRunResult,
  type ActorRunner,
} from "@server/infrastructure/email-verifier/apify";
import { DisabledEmailVerifier } from "@server/infrastructure/email-verifier/disabled";
import { EmailVerifierError } from "@server/lib/base-email-verifier";

interface RunnerCall {
  actorId: string;
  input: Record<string, unknown>;
  maxChargeUsd: number;
  waitSecs: number;
}

class FakeRunner implements ActorRunner {
  public calls: RunnerCall[] = [];

  public constructor(private readonly respond: () => ActorRunResult | Error) {}

  public async run(input: RunnerCall): Promise<ActorRunResult> {
    this.calls.push(input);
    const result = this.respond();
    if (result instanceof Error) throw result;

    return result;
  }
}

const succeeded = (items: unknown[]): ActorRunResult => ({
  status: "SUCCEEDED",
  items,
});

const verify = async (items: unknown[], addresses: string[]) => {
  const runner = new FakeRunner(() => succeeded(items));
  const result = await new ApifyEmailVerifier({ runner }).verify({ addresses });

  return { result, runner };
};

const verdictCases: {
  name: string;
  item: Record<string, unknown>;
  expected: LeadEmailVerification;
}[] = [
  {
    name: "a valid email",
    item: { status: "valid", is_catch_all: false },
    expected: "valid",
  },
  {
    name: "a valid email on a catch-all domain is only risky",
    item: { status: "valid", is_catch_all: true },
    expected: "risky",
  },
  {
    name: "an invalid email",
    item: { status: "invalid" },
    expected: "invalid",
  },
  { name: "a risky email", item: { status: "risky" }, expected: "risky" },
  {
    name: "a catch-all status",
    item: { status: "catch_all" },
    expected: "risky",
  },
  {
    name: "a valid-looking disposable address is invalid",
    item: { status: "valid", is_disposable: true },
    expected: "invalid",
  },
  {
    name: "a valid-looking spam trap is invalid",
    item: { status: "valid", is_spamtrap: true },
    expected: "invalid",
  },
  {
    name: "a status the app does not know yet fails safe to unknown",
    item: { status: "brand_new_status" },
    expected: "unknown",
  },
  { name: "a missing status is unknown", item: {}, expected: "unknown" },
  {
    name: "a different letter case still counts",
    item: { status: "VALID" },
    expected: "valid",
  },
];

for (const scenario of verdictCases) {
  test(`${scenario.name} is returned as ${scenario.expected}`, async () => {
    const { result } = await verify(
      [{ email: "ann@anncoach.com", ...scenario.item }],
      ["ann@anncoach.com"],
    );

    expect(result).toEqual([
      { address: "ann@anncoach.com", verification: scenario.expected },
    ]);
  });
}

test("results are matched to the addresses given regardless of order or case, and an address the actor skipped is unknown", async () => {
  const { result } = await verify(
    [
      { email: "BOB@Coach.com", status: "invalid" },
      { email: "ann@coach.com", status: "valid" },
      "not an item",
      { status: "valid" },
    ],
    ["ann@coach.com", "bob@coach.com", "skipped@coach.com"],
  );

  expect(result).toEqual([
    { address: "ann@coach.com", verification: "valid" },
    { address: "bob@coach.com", verification: "invalid" },
    { address: "skipped@coach.com", verification: "unknown" },
  ]);
});

test("every address goes out in a single actor run with a spend cap", async () => {
  const addresses = ["a@coach.com", "b@coach.com", "c@coach.com"];
  const { runner } = await verify([], addresses);

  expect(runner.calls).toEqual([
    {
      actorId: "bounceverify/bounceverify-email-verifier",
      input: { emails: addresses, skipInvalidSyntax: true },
      maxChargeUsd: 0.01,
      waitSecs: 180,
    },
  ]);
});

test("the spend cap grows with the number of addresses", async () => {
  const addresses = Array.from({ length: 100 }, (_, i) => `u${i}@coach.com`);
  const { runner } = await verify([], addresses);

  expect(runner.calls[0]?.maxChargeUsd).toBeCloseTo(0.2, 10);
});

test("no addresses means no actor run at all", async () => {
  const { result, runner } = await verify([], []);

  expect(result).toEqual([]);
  expect(runner.calls).toEqual([]);
});

const runFailures: { status: string; retryable: boolean }[] = [
  { status: "FAILED", retryable: true },
  { status: "TIMED-OUT", retryable: true },
  { status: "ABORTED", retryable: false },
];

for (const scenario of runFailures) {
  test(`an actor run that ended ${scenario.status} is an error that ${scenario.retryable ? "can" : "cannot"} be retried`, async () => {
    const runner = new FakeRunner(() => ({
      status: scenario.status,
      items: [],
    }));

    const error = await new ApifyEmailVerifier({ runner })
      .verify({ addresses: ["ann@coach.com"] })
      .then(
        () => null,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(EmailVerifierError);
    expect(error).toMatchObject({ retryable: scenario.retryable });
  });
}

test("an error from the runner reaches the caller as it was", async () => {
  const failure = new EmailVerifierError({
    message: "Apify answered HTTP 401",
    retryable: false,
  });
  const runner = new FakeRunner(() => failure);

  await expect(
    new ApifyEmailVerifier({ runner }).verify({ addresses: ["a@coach.com"] }),
  ).rejects.toBe(failure);
});

test("the disabled verifier says it is unavailable and refuses to verify", async () => {
  const disabled = new DisabledEmailVerifier();

  expect(disabled.isAvailable).toBe(false);
  await expect(disabled.verify()).rejects.toMatchObject({ retryable: false });
});
