import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API_URL, CLIENT_URL } from "../config";

// One port per worker, so parallel tests never share an agent
const AGENT_PORT = 8200 + Number(process.env.TEST_PARALLEL_INDEX ?? 0);
export const AGENT_ORIGIN = `http://localhost:${AGENT_PORT}`;
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
  name = `E2E agent ${randomBytes(4).toString("hex")}`,
): Promise<Agent> => {
  const response = await request.post(`${API_URL}/api/auth/mcp/register`, {
    headers: jsonHeaders,
    data: {
      redirect_uris: [AGENT_CALLBACK],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: name,
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

let agentServer: Server | undefined;

/** A real listener on the agent's callback address, because a redirected navigation cannot be intercepted */
export const startAgentCallback = async () => {
  if (agentServer) return;

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("agent");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(AGENT_PORT, resolve);
  });
  agentServer = server;
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
    // A signed-in context sends cookies, so the origin check wants a trusted origin
    headers: { Origin: CLIENT_URL },
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

  const answer = text(field(first, "text"), "tool text");
  const isError = field(result, "isError") === true;
  // A failed tool answers with a plain message, a successful one with JSON
  const value: unknown = isError ? answer : JSON.parse(answer);

  return { isError, value };
};

export const namesOf = (answer: unknown) => {
  const communities = field(answer, "communities");

  return Array.isArray(communities)
    ? communities.map((item) => field(item, "name"))
    : [];
};

export { field };

/** Connects an agent for the signed-in context without opening the browser, as a script would */
export const connectViaApi = async (
  signedIn: APIRequestContext,
  name = "E2E agent",
) => {
  const agent = await registerAgent(signedIn, name);
  const authorized = await signedIn.get(agent.authorizeUrl("state-api"), {
    maxRedirects: 0,
  });
  expect(authorized.status()).toBe(302);
  const code = text(
    new URL(authorized.headers()["location"] ?? "").searchParams.get("code"),
    "code",
  );
  const exchanged = await exchangeCode(signedIn, agent, code);
  expect(exchanged.status()).toBe(200);
  const body = await exchanged.json();

  return {
    agent,
    accessToken: text(field(body, "access_token"), "access_token"),
    refreshToken: text(field(body, "refresh_token"), "refresh_token"),
  };
};

export const refreshWith = (
  request: APIRequestContext,
  agent: Agent,
  refreshToken: string,
) =>
  request.post(`${API_URL}/api/auth/mcp/token`, {
    headers: { Origin: CLIENT_URL },
    form: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: agent.clientId,
    },
  });

export const callTool = async (
  request: APIRequestContext,
  token: string,
  name: string,
  args: object,
) =>
  toolAnswer(
    await mcp(request, token, "tools/call", { name, arguments: args }),
  );
