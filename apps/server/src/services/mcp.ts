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
  }
}
