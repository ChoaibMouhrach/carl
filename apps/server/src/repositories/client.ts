import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { clientsTable } from "@server/infrastructure/database/schemas";

export class ClientRepository extends BaseRepository {
  private static table = clientsTable;

  public async list(query: { userId: string; page: number; search?: string }) {
    const conditions = [eq(ClientRepository.table.userId, query.userId)];
    if (query.search) {
      conditions.push(ilike(ClientRepository.table.name, `%${query.search}%`));
    }
    const where = and(...conditions);

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [clients, [countRow]] = await Promise.all([
      this.db
        .select()
        .from(ClientRepository.table)
        .where(where)
        .orderBy(desc(ClientRepository.table.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(ClientRepository.table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { clients, lastPage };
  }

  public async findByClientId(where: { clientId: number; userId: string }) {
    const clients = await this.db
      .select()
      .from(ClientRepository.table)
      .where(
        and(
          eq(ClientRepository.table.clientId, where.clientId),
          eq(ClientRepository.table.userId, where.userId),
        ),
      )
      .limit(1);

    return clients.at(0) || null;
  }

  public async create(input: { userId: string; name: string; email: string }) {
    const clients = await this.db
      .insert(ClientRepository.table)
      .values(input)
      .returning();

    return clients.at(0)!;
  }

  public async update(
    where: { clientId: number; userId: string },
    input: { name: string; email: string },
  ) {
    const clients = await this.db
      .update(ClientRepository.table)
      .set(input)
      .where(
        and(
          eq(ClientRepository.table.clientId, where.clientId),
          eq(ClientRepository.table.userId, where.userId),
        ),
      )
      .returning();

    return clients.at(0) || null;
  }

  public async remove(where: { clientId: number; userId: string }) {
    await this.db
      .delete(ClientRepository.table)
      .where(
        and(
          eq(ClientRepository.table.clientId, where.clientId),
          eq(ClientRepository.table.userId, where.userId),
        ),
      );
  }
}
