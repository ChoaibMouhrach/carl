import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { foldersTable } from "@server/infrastructure/database/schemas";

export class FolderRepository extends BaseRepository {
  private static table = foldersTable;

  public async list(query: {
    clientId: number;
    userId: string;
    parentId: number | null;
    page: number;
    search?: string;
  }) {
    const conditions = [
      eq(FolderRepository.table.clientId, query.clientId),
      eq(FolderRepository.table.userId, query.userId),
      query.parentId === null
        ? isNull(FolderRepository.table.parentId)
        : eq(FolderRepository.table.parentId, query.parentId),
    ];
    if (query.search) {
      conditions.push(ilike(FolderRepository.table.name, `%${query.search}%`));
    }
    const where = and(...conditions);

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [folders, [countRow]] = await Promise.all([
      this.db
        .select()
        .from(FolderRepository.table)
        .where(where)
        .orderBy(desc(FolderRepository.table.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(FolderRepository.table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { folders, lastPage };
  }

  public async countByParent(where: {
    clientId: number;
    userId: string;
    parentId: number | null;
    search?: string;
  }) {
    const conditions = [
      eq(FolderRepository.table.clientId, where.clientId),
      eq(FolderRepository.table.userId, where.userId),
      where.parentId === null
        ? isNull(FolderRepository.table.parentId)
        : eq(FolderRepository.table.parentId, where.parentId),
    ];
    if (where.search) {
      conditions.push(ilike(FolderRepository.table.name, `%${where.search}%`));
    }

    const [row] = await this.db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(FolderRepository.table)
      .where(and(...conditions));

    return row?.count ?? 0;
  }

  public async listTopByParent(
    where: {
      clientId: number;
      userId: string;
      parentId: number | null;
      search?: string;
    },
    limit: number,
  ) {
    const conditions = [
      eq(FolderRepository.table.clientId, where.clientId),
      eq(FolderRepository.table.userId, where.userId),
      where.parentId === null
        ? isNull(FolderRepository.table.parentId)
        : eq(FolderRepository.table.parentId, where.parentId),
    ];
    if (where.search) {
      conditions.push(ilike(FolderRepository.table.name, `%${where.search}%`));
    }

    return await this.db
      .select()
      .from(FolderRepository.table)
      .where(and(...conditions))
      .orderBy(desc(FolderRepository.table.createdAt))
      .limit(limit);
  }

  public async listAllByClient(where: { clientId: number; userId: string }) {
    return await this.db
      .select({
        folderId: FolderRepository.table.folderId,
        parentId: FolderRepository.table.parentId,
      })
      .from(FolderRepository.table)
      .where(
        and(
          eq(FolderRepository.table.clientId, where.clientId),
          eq(FolderRepository.table.userId, where.userId),
        ),
      );
  }

  public async findByFolderId(where: {
    folderId: number;
    clientId: number;
    userId: string;
  }) {
    const folders = await this.db
      .select()
      .from(FolderRepository.table)
      .where(
        and(
          eq(FolderRepository.table.folderId, where.folderId),
          eq(FolderRepository.table.clientId, where.clientId),
          eq(FolderRepository.table.userId, where.userId),
        ),
      )
      .limit(1);

    return folders.at(0) || null;
  }

  public async getPath(where: {
    folderId: number;
    clientId: number;
    userId: string;
  }) {
    const path = [];
    let currentId: number | null = where.folderId;

    while (currentId !== null) {
      const folder = await this.findByFolderId({
        folderId: currentId,
        clientId: where.clientId,
        userId: where.userId,
      });

      if (!folder) break;

      path.unshift(folder);
      currentId = folder.parentId;
    }

    return path;
  }

  public async create(input: {
    clientId: number;
    userId: string;
    parentId: number | null;
    name: string;
  }) {
    const folders = await this.db
      .insert(FolderRepository.table)
      .values(input)
      .returning();

    return folders.at(0)!;
  }

  public async update(
    where: { folderId: number; clientId: number; userId: string },
    input: { name: string },
  ) {
    const folders = await this.db
      .update(FolderRepository.table)
      .set(input)
      .where(
        and(
          eq(FolderRepository.table.folderId, where.folderId),
          eq(FolderRepository.table.clientId, where.clientId),
          eq(FolderRepository.table.userId, where.userId),
        ),
      )
      .returning();

    return folders.at(0) || null;
  }

  public async remove(where: {
    folderId: number;
    clientId: number;
    userId: string;
  }) {
    await this.db
      .delete(FolderRepository.table)
      .where(
        and(
          eq(FolderRepository.table.folderId, where.folderId),
          eq(FolderRepository.table.clientId, where.clientId),
          eq(FolderRepository.table.userId, where.userId),
        ),
      );
  }
}
