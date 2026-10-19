import { desc, eq, max, min } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  oauthAccessTokenTable,
  oauthApplicationTable,
  userTable,
  type OAuthApplication,
} from "@server/infrastructure/database/schemas";

export class OAuthClientRepository extends BaseRepository {
  private static table = oauthApplicationTable;

  public async findByClientId(where: {
    clientId: string;
  }): Promise<OAuthApplication | null> {
    const clients = await this.db
      .select()
      .from(OAuthClientRepository.table)
      .where(eq(OAuthClientRepository.table.clientId, where.clientId))
      .limit(1);

    return clients.at(0) || null;
  }

  /** One row per agent that holds a token, with the admin who connected it */
  public async listConnections() {
    const tokens = oauthAccessTokenTable;

    return await this.db
      .select({
        clientId: tokens.clientId,
        name: oauthApplicationTable.name,
        userEmail: userTable.email,
        connectedAt: min(tokens.createdAt).mapWith(tokens.createdAt),
        lastActiveAt: max(tokens.updatedAt).mapWith(tokens.updatedAt),
      })
      .from(tokens)
      .innerJoin(
        oauthApplicationTable,
        eq(oauthApplicationTable.clientId, tokens.clientId),
      )
      .leftJoin(userTable, eq(userTable.id, tokens.userId))
      .groupBy(tokens.clientId, oauthApplicationTable.name, userTable.email)
      .orderBy(desc(min(tokens.createdAt)));
  }

  /** One agent that holds a token, or null once it was removed */
  public async findConnection(where: { clientId: string }) {
    const tokens = oauthAccessTokenTable;

    const rows = await this.db
      .select({
        clientId: tokens.clientId,
        name: oauthApplicationTable.name,
        redirectUrls: oauthApplicationTable.redirectUrls,
        userEmail: userTable.email,
        connectedAt: min(tokens.createdAt).mapWith(tokens.createdAt),
        lastTokenAt: max(tokens.updatedAt).mapWith(tokens.updatedAt),
      })
      .from(tokens)
      .innerJoin(
        oauthApplicationTable,
        eq(oauthApplicationTable.clientId, tokens.clientId),
      )
      .leftJoin(userTable, eq(userTable.id, tokens.userId))
      .where(eq(tokens.clientId, where.clientId))
      .groupBy(
        tokens.clientId,
        oauthApplicationTable.name,
        oauthApplicationTable.redirectUrls,
        userTable.email,
      );

    return rows.at(0) || null;
  }

  /** Returns how many tokens were removed */
  public async deleteTokens(where: { clientId: string }) {
    const removed = await this.db
      .delete(oauthAccessTokenTable)
      .where(eq(oauthAccessTokenTable.clientId, where.clientId))
      .returning({ id: oauthAccessTokenTable.id });

    return removed.length;
  }
}
