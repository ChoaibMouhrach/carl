import { test as base, type BrowserContext } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  attachCampaignLeads,
  createCampaign,
  createCommunity,
  createEmailChangeUrl,
  createLead,
  createScrapeRun,
  findCampaignByName,
  findCommunityBySkoolId,
  findLeadByUsername,
  listCampaignLeads,
  listCommunitiesByLeadId,
  listLeadsByUsernamePrefix,
  listOAuthTokens,
  expireOAuthTokens,
  listScrapeRuns,
  scriptSkool,
  unscriptSkool,
  type SeedCampaignInput,
  type SeedCommunityInput,
  type SeedLeadInput,
  type SkoolScript,
  createEmailVerificationUrl,
  createSessionCookie,
  createVerifiedAdmin,
  createVerifiedMember,
  setUserRole,
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
  attachCampaignLeads: (
    input: Parameters<typeof attachCampaignLeads>[1],
  ) => ReturnType<typeof attachCampaignLeads>;
  createCampaign: (
    input: SeedCampaignInput,
  ) => ReturnType<typeof createCampaign>;
  createCommunity: (
    input: SeedCommunityInput,
  ) => ReturnType<typeof createCommunity>;
  createLead: (input: SeedLeadInput) => ReturnType<typeof createLead>;
  createScrapeRun: (
    input: Parameters<typeof createScrapeRun>[1],
  ) => ReturnType<typeof createScrapeRun>;
  findCampaignByName: (name: string) => ReturnType<typeof findCampaignByName>;
  findCommunityBySkoolId: (
    skoolId: string,
  ) => ReturnType<typeof findCommunityBySkoolId>;
  findLeadByUsername: (
    skoolUsername: string,
  ) => ReturnType<typeof findLeadByUsername>;
  listCampaignLeads: (
    campaignId: number,
  ) => ReturnType<typeof listCampaignLeads>;
  listCommunitiesByLeadId: (
    leadId: number,
  ) => ReturnType<typeof listCommunitiesByLeadId>;
  listLeadsByUsernamePrefix: (
    prefix: string,
  ) => ReturnType<typeof listLeadsByUsernamePrefix>;
  listScrapeRuns: (campaignId: number) => ReturnType<typeof listScrapeRuns>;
  listOAuthTokens: (email: string) => ReturnType<typeof listOAuthTokens>;
  expireOAuthTokens: (email: string) => Promise<void>;
  scriptSkool: (script: SkoolScript) => Promise<void>;
  unscriptSkool: (script: SkoolScript) => Promise<void>;
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
  createVerifiedMember: (
    input?: Partial<CreateVerifiedUserInput>,
  ) => Promise<SeededUser>;
  setUserRole: (email: string, role: "admin" | "user") => Promise<void>;
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
      attachCampaignLeads: (input) => attachCampaignLeads(config, input),
      createCampaign: (input) => createCampaign(config, input),
      createCommunity: (input) => createCommunity(config, input),
      createLead: (input) => createLead(config, input),
      createScrapeRun: (input) => createScrapeRun(config, input),
      findCampaignByName: (name) => findCampaignByName(config, name),
      findCommunityBySkoolId: (skoolId) =>
        findCommunityBySkoolId(config, skoolId),
      findLeadByUsername: (skoolUsername) =>
        findLeadByUsername(config, skoolUsername),
      listCampaignLeads: (campaignId) => listCampaignLeads(config, campaignId),
      listCommunitiesByLeadId: (leadId) =>
        listCommunitiesByLeadId(config, leadId),
      listLeadsByUsernamePrefix: (prefix) =>
        listLeadsByUsernamePrefix(config, prefix),
      listScrapeRuns: (campaignId) => listScrapeRuns(config, campaignId),
      listOAuthTokens: (email) => listOAuthTokens(config, email),
      expireOAuthTokens: (email) => expireOAuthTokens(config, email),
      scriptSkool: (script) => scriptSkool(config, script),
      unscriptSkool: (script) => unscriptSkool(config, script),
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
      createVerifiedMember: (input) => {
        return createVerifiedMember(config, createUserInput(input));
      },
      setUserRole: (email, role) => setUserRole(config, { email, role }),
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
