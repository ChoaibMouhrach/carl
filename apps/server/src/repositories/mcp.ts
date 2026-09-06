import { and, eq, gt, sql } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  oauthAccessTokenTable,
  oauthApplicationTable,
  oauthConsentTable,
} from "@server/infrastructure/database/schemas";

export class McpRepository extends BaseRepository {
  public async listConnections(input: { userId: string }) {
    return await this.db
      .select({
        clientId: oauthApplicationTable.clientId,
        name: oauthApplicationTable.name,
        icon: oauthApplicationTable.icon,
        connectedAt: sql<Date>`min(${oauthAccessTokenTable.createdAt})`,
        lastUsedAt: sql<Date>`max(${oauthAccessTokenTable.createdAt})`,
      })
      .from(oauthAccessTokenTable)
      .innerJoin(
        oauthApplicationTable,
        eq(oauthAccessTokenTable.clientId, oauthApplicationTable.clientId),
      )
      .where(
        and(
          eq(oauthAccessTokenTable.userId, input.userId),
          gt(oauthAccessTokenTable.refreshTokenExpiresAt, new Date()),
        ),
      )
      .groupBy(
        oauthApplicationTable.clientId,
        oauthApplicationTable.name,
        oauthApplicationTable.icon,
      );
  }

  public async findConnection(input: { clientId: string; userId: string }) {
    const rows = await this.db
      .select({ clientId: oauthAccessTokenTable.clientId })
      .from(oauthAccessTokenTable)
      .where(
        and(
          eq(oauthAccessTokenTable.clientId, input.clientId),
          eq(oauthAccessTokenTable.userId, input.userId),
        ),
      )
      .limit(1);

    return rows.at(0) ?? null;
  }

  public async revokeConnection(input: {
    clientId: string;
    userId: string;
  }): Promise<void> {
    await this.db
      .delete(oauthAccessTokenTable)
      .where(
        and(
          eq(oauthAccessTokenTable.clientId, input.clientId),
          eq(oauthAccessTokenTable.userId, input.userId),
        ),
      );

    await this.db
      .delete(oauthConsentTable)
      .where(
        and(
          eq(oauthConsentTable.clientId, input.clientId),
          eq(oauthConsentTable.userId, input.userId),
        ),
      );
  }
}
