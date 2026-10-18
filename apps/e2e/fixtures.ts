import { test as base, type BrowserContext } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  createEmailChangeUrl,
  createEmailVerificationUrl,
  createSessionCookie,
  createVerifiedAdmin,
  getActiveSessionCount,
  getEmailVerificationStatus,
  getPasswordResetToken,
  getUserEmail,
  resetE2EAuthRateLimits,
  type CreateVerifiedUserInput,
  type SeededUser,
} from "@repo/server/testing/e2e-seed";
import { CLIENT_URL, seedConfig } from "./config";

interface Seed {
  authenticate: (
    context: BrowserContext,
    email: string,
    userAgent?: string,
  ) => Promise<void>;
  createEmailChangeUrl: (input: {
    currentEmail: string;
    newEmail: string;
    requestType: "change-email-confirmation" | "change-email-verification";
  }) => Promise<string>;
  createVerifiedAdmin: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  createEmailVerificationUrl: (email: string) => Promise<string>;
  getActiveSessionCount: (email: string) => Promise<number>;
  getEmailVerificationStatus: (email: string) => Promise<boolean>;
  getPasswordResetToken: (email: string) => Promise<string>;
  getUserEmail: (userId: string) => Promise<string>;
}

const createUserInput = (
  input?: Partial<CreateVerifiedUserInput>,
): CreateVerifiedUserInput => ({
  email: input?.email ?? `e2e-${faker.string.uuid()}@example.com`,
  password: input?.password ?? "Test1234@@",
  name: input?.name ?? faker.person.fullName(),
});

export const test = base.extend<{ seed: Seed; resetRateLimits: void }>({
  // Auth endpoints are IP-rate-limited; clear the budget before every test so
  // the shared localhost IP does not leak limits between tests.
  resetRateLimits: [
    async ({}, use) => {
      await resetE2EAuthRateLimits(seedConfig());
      await use();
    },
    { auto: true },
  ],
  seed: async ({}, use) => {
    const config = seedConfig();

    await use({
      authenticate: async (context, email, userAgent) => {
        const cookie = await createSessionCookie(config, { email, userAgent });
        await context.addCookies([
          {
            ...cookie,
            httpOnly: true,
            sameSite: "Lax",
            url: CLIENT_URL,
          },
        ]);
      },
      createEmailChangeUrl: (input) => {
        return createEmailChangeUrl(config, {
          callbackUrl: `${CLIENT_URL}/admin/account`,
          ...input,
        });
      },
      createEmailVerificationUrl: (email) => {
        return createEmailVerificationUrl(config, {
          callbackUrl: `${CLIENT_URL}/email-verified?email=${encodeURIComponent(email)}`,
          email,
        });
      },
      createVerifiedAdmin: (input) => {
        return createVerifiedAdmin(config, createUserInput(input));
      },
      getActiveSessionCount: (email) => {
        return getActiveSessionCount(config, email);
      },
      getEmailVerificationStatus: (email) => {
        return getEmailVerificationStatus(config, email);
      },
      getPasswordResetToken: (email) => getPasswordResetToken(config, email),
      getUserEmail: (userId) => {
        return getUserEmail(config, userId);
      },
    });
  },
});

export { expect } from "@playwright/test";
