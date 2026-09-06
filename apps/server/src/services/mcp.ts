import { BaseService } from "@server/lib/base-service";
import { NotFoundError } from "@server/lib/errors";

export class McpService extends BaseService {
  public async listConnections(input: { userId: string }) {
    const connections = await this.context.repositories.mcp.listConnections({
      userId: input.userId,
    });

    return { connections };
  }

  public async revokeConnection(input: {
    clientId: string;
    userId: string;
  }): Promise<void> {
    const connection = await this.context.repositories.mcp.findConnection({
      clientId: input.clientId,
      userId: input.userId,
    });

    if (!connection) {
      throw new NotFoundError({ message: "Connection not found." });
    }

    await this.context.repositories.mcp.revokeConnection({
      clientId: input.clientId,
      userId: input.userId,
    });
  }
}
