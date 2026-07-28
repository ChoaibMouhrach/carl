import { test as base } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  createEmailVerificationUrl,
  createVerifiedUser,
  getEmailVerificationStatus,
  getPasswordResetToken,
  type CreateVerifiedUserInput,
  type SeededUser,
} from "@repo/server/testing/e2e-seed";
import { CLIENT_URL, seedConfig } from "./config";

interface Seed {
  createVerifiedUser: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  createEmailVerificationUrl: (email: string) => Promise<string>;
  getEmailVerificationStatus: (email: string) => Promise<boolean>;
  getPasswordResetToken: (email: string) => Promise<string>;
}

export const test = base.extend<{ seed: Seed }>({
  seed: async ({}, use) => {
    const config = seedConfig();

    await use({
      createEmailVerificationUrl: (email) => {
        return createEmailVerificationUrl(config, {
          callbackUrl: `${CLIENT_URL}/app/email-verified?email=${encodeURIComponent(email)}`,
          email,
        });
      },
      createVerifiedUser: (input) => {
        return createVerifiedUser(config, {
          email: input?.email ?? `e2e-${faker.string.uuid()}@example.com`,
          password: input?.password ?? "Test1234@@",
          name: input?.name ?? faker.person.fullName(),
        });
      },
      getEmailVerificationStatus: (email) => {
        return getEmailVerificationStatus(config, email);
      },
      getPasswordResetToken: (email) => getPasswordResetToken(config, email),
    });
  },
});

export { expect } from "@playwright/test";
