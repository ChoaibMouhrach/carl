import { test as base, type BrowserContext } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  clientExists,
  countClientsByUser,
  countFilesByClient,
  countFoldersByClient,
  createClient,
  createEmailChangeUrl,
  createEmailVerificationUrl,
  createFile,
  createFolder,
  createOnboardedUser,
  createSessionCookie,
  createUnverifiedUser,
  createUsers,
  createVerifiedAdmin,
  createVerifiedUser,
  fileExists,
  findClientByEmail,
  findFileByName,
  findFolderByName,
  folderExists,
  getActiveSessionCount,
  getClient,
  getEmailVerificationStatus,
  getFile,
  getFolder,
  getPasswordResetToken,
  getUserEmail,
  resetE2EAuthRateLimits,
  userExists,
  type CreateOnboardedUserInput,
  type CreateVerifiedUserInput,
  type SeededClient,
  type SeededFile,
  type SeededFolder,
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
  createClient: (input: {
    userId: string;
    name?: string;
    email?: string;
  }) => Promise<SeededClient>;
  getClient: (clientId: number) => Promise<SeededClient | null>;
  findClientByEmail: (email: string) => Promise<SeededClient | null>;
  clientExists: (clientId: number) => Promise<boolean>;
  countClientsByUser: (userId: string) => Promise<number>;
  createFolder: (input: {
    clientId: number;
    userId: string;
    name: string;
    parentId?: number | null;
  }) => Promise<SeededFolder>;
  createFile: (input: {
    clientId: number;
    userId: string;
    folderId?: number | null;
    name: string;
    sizeBytes?: number;
    mimeType?: string;
  }) => Promise<SeededFile>;
  getFolder: (folderId: number) => Promise<SeededFolder | null>;
  getFile: (fileId: number) => Promise<SeededFile | null>;
  findFolderByName: (where: {
    clientId: number;
    parentId: number | null;
    name: string;
  }) => Promise<SeededFolder | null>;
  findFileByName: (where: {
    clientId: number;
    folderId: number | null;
    name: string;
  }) => Promise<SeededFile | null>;
  folderExists: (folderId: number) => Promise<boolean>;
  fileExists: (fileId: number) => Promise<boolean>;
  countFoldersByClient: (clientId: number) => Promise<number>;
  countFilesByClient: (clientId: number) => Promise<number>;
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
      createClient: (input) => createClient(config, input),
      getClient: (clientId) => getClient(config, clientId),
      findClientByEmail: (email) => findClientByEmail(config, email),
      clientExists: (clientId) => clientExists(config, clientId),
      countClientsByUser: (userId) => countClientsByUser(config, userId),
      createFolder: (input) => createFolder(config, input),
      createFile: (input) => createFile(config, input),
      getFolder: (folderId) => getFolder(config, folderId),
      getFile: (fileId) => getFile(config, fileId),
      findFolderByName: (where) => findFolderByName(config, where),
      findFileByName: (where) => findFileByName(config, where),
      folderExists: (folderId) => folderExists(config, folderId),
      fileExists: (fileId) => fileExists(config, fileId),
      countFoldersByClient: (clientId) =>
        countFoldersByClient(config, clientId),
      countFilesByClient: (clientId) => countFilesByClient(config, clientId),
    });
  },
});

export { expect } from "@playwright/test";
