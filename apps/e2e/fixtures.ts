import { test as base, type BrowserContext } from "@playwright/test";
import { faker } from "@faker-js/faker";
import {
  addCommunitiesToCampaign,
  addLeadsToCampaign,
  countCampaignsContaining,
  countCommunitiesWithPrefix,
  countLeadsWithPrefix,
  createCampaign,
  createCommunity,
  createEmailChangeUrl,
  createLead,
  createLeads,
  createPipelineRun,
  deleteCampaignsContaining,
  listPipelineRuns,
  updatePipelineRun,
  findCampaignByName,
  findCommunityBySlug,
  findLeadByUsername,
  listCampaignCommunityIds,
  listCampaignLeadIds,
  ageSessions,
  banUser,
  deleteUser,
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
  type SeedCampaignInput,
  type SeedCommunityInput,
  type SeedPipelineRunInput,
  type SeedLeadInput,
  type SeededUser,
} from "@repo/server/testing/e2e-seed";
import { CLIENT_URL, seedConfig } from "./config";

interface Seed {
  addCommunitiesToCampaign: (input: {
    campaignId: number;
    communityIds: number[];
  }) => Promise<void>;
  addLeadsToCampaign: (input: {
    campaignId: number;
    leadIds: number[];
  }) => Promise<void>;
  countCampaignsContaining: (fragment: string) => Promise<number>;
  createCampaign: (
    input: SeedCampaignInput,
  ) => ReturnType<typeof createCampaign>;
  deleteCampaignsContaining: (fragment: string) => Promise<void>;
  createPipelineRun: (
    input: SeedPipelineRunInput,
  ) => ReturnType<typeof createPipelineRun>;
  updatePipelineRun: (input: {
    runId: number;
    status: "running" | "done" | "failed";
    processed: number;
    failed?: number;
  }) => Promise<void>;
  listPipelineRuns: (campaignId: number) => ReturnType<typeof listPipelineRuns>;
  findCampaignByName: (name: string) => ReturnType<typeof findCampaignByName>;
  listCampaignCommunityIds: (campaignId: number) => Promise<number[]>;
  listCampaignLeadIds: (campaignId: number) => Promise<number[]>;
  countCommunitiesWithPrefix: (prefix: string) => Promise<number>;
  countLeadsWithPrefix: (prefix: string) => Promise<number>;
  createCommunity: (
    input: SeedCommunityInput,
  ) => ReturnType<typeof createCommunity>;
  createLead: (input: SeedLeadInput) => ReturnType<typeof createLead>;
  createLeads: (input: {
    prefix: string;
    count: number;
  }) => ReturnType<typeof createLeads>;
  findCommunityBySlug: (slug: string) => ReturnType<typeof findCommunityBySlug>;
  findLeadByUsername: (
    username: string,
  ) => ReturnType<typeof findLeadByUsername>;
  ageSessions: (email: string) => Promise<void>;
  banUser: (email: string) => Promise<void>;
  deleteUser: (email: string) => Promise<void>;
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
      addCommunitiesToCampaign: (input) =>
        addCommunitiesToCampaign(config, input),
      addLeadsToCampaign: (input) => addLeadsToCampaign(config, input),
      countCampaignsContaining: (fragment) =>
        countCampaignsContaining(config, fragment),
      createCampaign: (input) => createCampaign(config, input),
      deleteCampaignsContaining: (fragment) =>
        deleteCampaignsContaining(config, fragment),
      createPipelineRun: (input) => createPipelineRun(config, input),
      updatePipelineRun: (input) => updatePipelineRun(config, input),
      listPipelineRuns: (campaignId) => listPipelineRuns(config, campaignId),
      findCampaignByName: (name) => findCampaignByName(config, name),
      listCampaignCommunityIds: (campaignId) =>
        listCampaignCommunityIds(config, campaignId),
      listCampaignLeadIds: (campaignId) =>
        listCampaignLeadIds(config, campaignId),
      countCommunitiesWithPrefix: (prefix) =>
        countCommunitiesWithPrefix(config, prefix),
      countLeadsWithPrefix: (prefix) => countLeadsWithPrefix(config, prefix),
      createCommunity: (input) => createCommunity(config, input),
      createLead: (input) => createLead(config, input),
      createLeads: (input) => createLeads(config, input),
      findCommunityBySlug: (slug) => findCommunityBySlug(config, slug),
      findLeadByUsername: (username) => findLeadByUsername(config, username),
      ageSessions: (email) => ageSessions(config, email),
      banUser: (email) => banUser(config, email),
      deleteUser: (email) => deleteUser(config, email),
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
