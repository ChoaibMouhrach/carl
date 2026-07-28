import { test as base, type BrowserContext } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  createEmailChangeUrl,
  createEmailVerificationUrl,
  createOnboardedUser,
  createSessionCookie,
  createUnverifiedUser,
  createUsers,
  createVerifiedAdmin,
  createVerifiedUser,
  getActiveSessionCount,
  getEmailVerificationStatus,
  getPasswordResetToken,
  getUserEmail,
  userExists,
  type CreateOnboardedUserInput,
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
  createVerifiedUser: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  createOnboardedUser: (
    input?: Partial<CreateOnboardedUserInput>,
  ) => Promise<SeededUser>;
  createVerifiedAdmin: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  createUnverifiedUser: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  createUsers: (emails: string[]) => Promise<void>;
  createEmailVerificationUrl: (email: string) => Promise<string>;
  getActiveSessionCount: (email: string) => Promise<number>;
  getEmailVerificationStatus: (email: string) => Promise<boolean>;
  getPasswordResetToken: (email: string) => Promise<string>;
  getUserEmail: (userId: string) => Promise<string>;
  userExists: (userId: string) => Promise<boolean>;
}

const createUserInput = (
  input?: Partial<CreateVerifiedUserInput>,
): CreateVerifiedUserInput => ({
  email: input?.email ?? `e2e-${faker.string.uuid()}@example.com`,
  password: input?.password ?? "Test1234@@",
  name: input?.name ?? faker.person.fullName(),
});

export const test = base.extend<{ seed: Seed }>({
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
          callbackUrl: `${CLIENT_URL}/app/user/account`,
          ...input,
        });
      },
      createEmailVerificationUrl: (email) => {
        return createEmailVerificationUrl(config, {
          callbackUrl: `${CLIENT_URL}/app/email-verified?email=${encodeURIComponent(email)}`,
          email,
        });
      },
      createOnboardedUser: (input) => {
        return createOnboardedUser(config, {
          ...createUserInput(input),
          subscriptionStatus: input?.subscriptionStatus,
        });
      },
      createVerifiedAdmin: (input) => {
        return createVerifiedAdmin(config, createUserInput(input));
      },
      createVerifiedUser: (input) => {
        return createVerifiedUser(config, createUserInput(input));
      },
      createUnverifiedUser: (input) => {
        return createUnverifiedUser(config, createUserInput(input));
      },
      createUsers: (emails) => createUsers(config, emails),
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
      userExists: (userId) => {
        return userExists(config, userId);
      },
    });
  },
});

export { expect } from "@playwright/test";
