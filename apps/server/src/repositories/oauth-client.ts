import { eq } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  oauthApplicationTable,
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
}
