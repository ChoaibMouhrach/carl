import { test as base } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  createVerifiedUser,
  getPasswordResetToken,
  type CreateVerifiedUserInput,
  type SeededUser,
} from "@repo/server/testing/e2e-seed";
import { seedConfig } from "./config";

interface Seed {
  createVerifiedUser: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  getPasswordResetToken: (email: string) => Promise<string>;
}

export const test = base.extend<{ seed: Seed }>({
  seed: async ({}, use) => {
    const config = seedConfig();

    await use({
      createVerifiedUser: (input) => {
        return createVerifiedUser(config, {
          email: input?.email ?? `e2e-${faker.string.uuid()}@example.com`,
          password: input?.password ?? "Test1234@@",
          name: input?.name ?? faker.person.fullName(),
        });
      },
      getPasswordResetToken: (email) => getPasswordResetToken(config, email),
    });
  },
});

export { expect } from "@playwright/test";
