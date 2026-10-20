import type { Context } from "@server/context";
import type {
  CommunityInsert,
  LeadInsert,
} from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp } from "./http";

interface RequestInit {
  body?: object;
}

export const createAdminClient = async (context: Context, email: string) => {
  const admin = await createAuthenticatedApp({
    context,
    email,
    role: "admin",
  });

  const request = (method: string, path: string, init: RequestInit = {}) =>
    admin.app.request(path, {
      method,
      headers: {
        cookie: admin.cookie,
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  return {
    ...admin,
    get: (path: string) => request("GET", path),
    post: (path: string, body?: object) => request("POST", path, { body }),
    put: (path: string, body?: object) => request("PUT", path, { body }),
    patch: (path: string, body?: object) => request("PATCH", path, { body }),
    delete: (path: string) => request("DELETE", path),
  };
};

let sequence = 0;

export const seedLead = async (
  context: Context,
  overrides: Partial<LeadInsert> = {},
) => {
  sequence += 1;

  return await context.repositories.lead.create({
    skoolUsername: `lead-${sequence}`,
    name: `Lead ${sequence}`,
    ...overrides,
  });
};

export const seedCommunity = async (
  context: Context,
  leadId: number,
  overrides: Partial<CommunityInsert> = {},
) => {
  sequence += 1;

  return await context.repositories.community.create({
    leadId,
    skoolId: `community-${sequence}`,
    name: `community-${sequence}`,
    displayName: `Community ${sequence}`,
    communityUrl: `https://www.skool.com/community-${sequence}`,
    memberCount: 100,
    pricingType: "free",
    ...overrides,
  });
};
