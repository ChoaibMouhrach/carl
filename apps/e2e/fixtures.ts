import { test as base } from "@playwright/test";
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

const uniqueEmail = (): string =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export const test = base.extend<{ seed: Seed }>({
  seed: async ({}, use) => {
    const config = seedConfig();

    await use({
      createVerifiedUser: (input) =>
        createVerifiedUser(config, {
          email: input?.email ?? uniqueEmail(),
          password: input?.password ?? "Test1234@@",
          name: input?.name,
        }),
      getPasswordResetToken: (email) => getPasswordResetToken(config, email),
    });
  },
});

export { expect } from "@playwright/test";
