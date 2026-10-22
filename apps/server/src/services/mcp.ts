import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseService } from "@server/lib/base-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@server/lib/errors";

export class McpService extends BaseService {
  /** MCP access follows the same rule as the rest of the platform: admins only, through an enabled client */
  public async assertAccess(token: {
    userId: string | null | undefined;
    clientId: string;
  }) {
    const { userId } = token;

    if (!userId) {
      throw new UnauthorizedError({ message: "Invalid session" });
    }

    const client = await this.context.repositories.oauthClient.findByClientId({
      clientId: token.clientId,
    });

    if (!client || client.disabled) {
      throw new UnauthorizedError({ message: "Invalid session" });
    }

    const user = await this.context.repositories.user.findByUserId({ userId });

    if (!user || user.role !== "admin" || user.banned) {
      throw new ForbiddenError();
    }
  }

  public async listAgents() {
    const agents =
      await this.context.repositories.oauthClient.listConnections();

    return { agents };
  }

  public async revokeAgent(where: { clientId: string }) {
    const removed =
      await this.context.repositories.oauthClient.deleteTokens(where);

    if (removed === 0) {
      throw new NotFoundError({ message: "Agent not found." });
    }

    await this.context.repositories.mcpRequest.deleteByClientId(where);
  }

  public async getAgent(where: { clientId: string }) {
    const { oauthClient, mcpRequest } = this.context.repositories;
    const connection = await oauthClient.findConnection(where);

    if (!connection) {
      throw new NotFoundError({ message: "Agent not found." });
    }

    const stats = await mcpRequest.statsByClientId(where);

    return {
      agent: {
        clientId: connection.clientId,
        name: connection.name,
        userEmail: connection.userEmail,
        redirectUrls: connection.redirectUrls
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean),
        connectedAt: connection.connectedAt,
        lastActiveAt: stats.lastRequestAt ?? connection.lastTokenAt,
        requestCount: stats.total,
        errorCount: stats.errors,
      },
    };
  }

  public async listAgentRequests(input: { clientId: string; page: number }) {
    await this.getAgent({ clientId: input.clientId });

    const { requests, total } = await this.context.repositories.mcpRequest.list(
      {
        clientId: input.clientId,
        page: input.page,
        limit: DEFAULT_RECORD_LIMIT,
      },
    );

    return {
      requests,
      meta: {
        page: input.page,
        lastPage: Math.max(1, Math.ceil(total / DEFAULT_RECORD_LIMIT)),
        total,
      },
    };
  }

  public async getAgentRequest(where: {
    clientId: string;
    mcpRequestId: number;
  }) {
    const request =
      await this.context.repositories.mcpRequest.findByMcpRequestId(where);

    if (!request) {
      throw new NotFoundError({ message: "Request not found." });
    }

    return { request };
  }

  /** Keeps a record of what an agent asked and what it was answered; a failure here never fails the call */
  public async recordRequest(input: {
    clientId: string;
    userId: string | null | undefined;
    requestBody: string;
    responseBody: string;
    statusCode: number;
    durationMs: number;
  }) {
    try {
      const summary = summarizeRequest(input.requestBody);

      await this.context.repositories.mcpRequest.create({
        clientId: input.clientId,
        userId: input.userId ?? null,
        rpcMethod: summary.method,
        toolName: summary.tool,
        requestBody: clip(input.requestBody),
        responseBody: clip(input.responseBody),
        statusCode: input.statusCode,
        isError: input.statusCode >= 400 || responseFailed(input.responseBody),
        durationMs: input.durationMs,
      });
    } catch (error) {
      void this.context.logger.error(
        { message: "An MCP request could not be recorded." },
        error,
      );
    }
  }
}

const MAX_BODY_LENGTH = 100_000;

const clip = (body: string) =>
  body.length > MAX_BODY_LENGTH
    ? `${body.slice(0, MAX_BODY_LENGTH)}\n… clipped, ${body.length - MAX_BODY_LENGTH} more characters`
    : body;

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const messagesOf = (body: string): unknown[] => {
  const parsed = parseJson(body);

  return Array.isArray(parsed) ? parsed : [parsed];
};

const summarizeRequest = (body: string) => {
  const messages = messagesOf(body);
  const methods = messages
    .map((message) => field(message, "method"))
    .filter((method) => typeof method === "string");
  const tools = messages
    .map((message) => field(field(message, "params"), "name"))
    .filter((name) => typeof name === "string");

  return {
    method: methods.length > 0 ? methods.join(", ") : "unknown",
    tool: tools.length > 0 ? tools.join(", ") : null,
  };
};

const responseFailed = (body: string) =>
  messagesOf(body).some(
    (message) =>
      field(message, "error") !== undefined ||
      field(field(message, "result"), "isError") === true,
  );
