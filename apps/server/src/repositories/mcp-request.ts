import { and, count, desc, eq, max, sql } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  mcpRequestsTable,
  type McpRequest,
} from "@server/infrastructure/database/schemas";

type McpRequestInsert = typeof mcpRequestsTable.$inferInsert;

export class McpRequestRepository extends BaseRepository {
  private static table = mcpRequestsTable;

  public async create(input: McpRequestInsert) {
    await this.db.insert(McpRequestRepository.table).values(input);
  }

  /** The list leaves out the bodies, which can be large */
  public async list(query: { clientId: string; page: number; limit: number }) {
    const table = McpRequestRepository.table;
    const where = eq(table.clientId, query.clientId);

    const [requests, [countRow]] = await Promise.all([
      this.db
        .select({
          mcpRequestId: table.mcpRequestId,
          rpcMethod: table.rpcMethod,
          toolName: table.toolName,
          statusCode: table.statusCode,
          isError: table.isError,
          durationMs: table.durationMs,
          createdAt: table.createdAt,
        })
        .from(table)
        .where(where)
        .orderBy(desc(table.createdAt), desc(table.mcpRequestId))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.db.select({ count: count() }).from(table).where(where),
    ]);

    return { requests, total: countRow?.count ?? 0 };
  }

  public async findByMcpRequestId(where: {
    clientId: string;
    mcpRequestId: number;
  }): Promise<McpRequest | null> {
    const table = McpRequestRepository.table;
    const requests = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.clientId, where.clientId),
          eq(table.mcpRequestId, where.mcpRequestId),
        ),
      )
      .limit(1);

    return requests.at(0) || null;
  }

  public async statsByClientId(where: { clientId: string }) {
    const table = McpRequestRepository.table;
    const [row] = await this.db
      .select({
        total: count(),
        errors: sql<number>`count(*) filter (where ${table.isError})`.mapWith(
          Number,
        ),
        lastRequestAt: max(table.createdAt).mapWith(table.createdAt),
      })
      .from(table)
      .where(eq(table.clientId, where.clientId));

    return {
      total: row?.total ?? 0,
      errors: row?.errors ?? 0,
      lastRequestAt: row?.lastRequestAt ?? null,
    };
  }

  public async deleteByClientId(where: { clientId: string }) {
    await this.db
      .delete(McpRequestRepository.table)
      .where(eq(McpRequestRepository.table.clientId, where.clientId));
  }
}
