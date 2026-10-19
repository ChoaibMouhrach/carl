import { createHash, randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API_URL, CLIENT_URL } from "../config";

export const AGENT_ORIGIN = "http://localhost:8123";
export const AGENT_CALLBACK = `${AGENT_ORIGIN}/callback`;

const jsonHeaders = { Origin: CLIENT_URL, "content-type": "application/json" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const field = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

const text = (value: unknown, label: string) => {
  if (typeof value !== "string") {
    throw new Error(`${label} was not a string`);
  }

  return value;
};

export interface Agent {
  clientId: string;
  verifier: string;
  authorizeUrl: (state: string) => string;
}

/** An MCP client that has registered itself, the way a real agent does */
export const registerAgent = async (
  request: APIRequestContext,
): Promise<Agent> => {
  const response = await request.post(`${API_URL}/api/auth/mcp/register`, {
    headers: jsonHeaders,
    data: {
      redirect_uris: [AGENT_CALLBACK],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "E2E agent",
    },
  });
  expect(response.status()).toBeLessThan(300);

  const clientId = text(field(await response.json(), "client_id"), "client_id");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  return {
    clientId,
    verifier,
    authorizeUrl: (state) =>
      `${API_URL}/api/auth/mcp/authorize?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: AGENT_CALLBACK,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: "openid offline_access",
        state,
      })}`,
  };
};

/** Answers the agent's callback address so the browser has somewhere to land */
export const catchAgentCallback = async (page: Page) => {
  await page.route(`${AGENT_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "agent" }),
  );
};

export const readCallback = (page: Page) => {
  const url = new URL(page.url());

  return {
    code: text(url.searchParams.get("code"), "code"),
    state: url.searchParams.get("state"),
  };
};

export const exchangeCode = async (
  request: APIRequestContext,
  agent: Agent,
  code: string,
) => {
  const response = await request.post(`${API_URL}/api/auth/mcp/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: AGENT_CALLBACK,
      client_id: agent.clientId,
      code_verifier: agent.verifier,
    },
  });

  return response;
};

export const accessTokenOf = async (
  response: Awaited<ReturnType<typeof exchangeCode>>,
) => {
  expect(response.status()).toBe(200);

  return text(field(await response.json(), "access_token"), "access_token");
};

export const mcp = (
  request: APIRequestContext,
  token: string | null,
  method: string,
  params: object = {},
) =>
  request.post(`${API_URL}/api/mcp`, {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });

/** What a tool answered, read out of the JSON-RPC envelope */
export const toolAnswer = async (response: Awaited<ReturnType<typeof mcp>>) => {
  expect(response.status()).toBe(200);
  const result = field(await response.json(), "result");
  const content = field(result, "content");
  const first = Array.isArray(content) ? content[0] : undefined;

  const value: unknown = JSON.parse(text(field(first, "text"), "tool text"));

  return { isError: field(result, "isError") === true, value };
};

export const namesOf = (answer: unknown) => {
  const communities = field(answer, "communities");

  return Array.isArray(communities)
    ? communities.map((item) => field(item, "name"))
    : [];
};

export { field };
