import {
  filesTable,
  type FileInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";

export class FileRepository extends BaseRepository {
  public static table = filesTable;

  public async findByFileId(where: { fileId: number }) {
    const [file] = await this.db
      .select()
      .from(FileRepository.table)
      .where(eq(FileRepository.table.fileId, where.fileId))
      .limit(1);

    return file || null;
  }

  public async findScoped(where: {
    fileId: number;
    clientId: number;
    userId: string;
  }) {
    const [file] = await this.db
      .select()
      .from(FileRepository.table)
      .where(
        and(
          eq(FileRepository.table.fileId, where.fileId),
          eq(FileRepository.table.clientId, where.clientId),
          eq(FileRepository.table.userId, where.userId),
        ),
      )
      .limit(1);

    return file || null;
  }

  public async listByLocation(query: {
    clientId: number;
    folderId: number | null;
    userId: string;
    page: number;
  }) {
    const where = and(
      eq(FileRepository.table.clientId, query.clientId),
      query.folderId === null
        ? isNull(FileRepository.table.folderId)
        : eq(FileRepository.table.folderId, query.folderId),
      eq(FileRepository.table.userId, query.userId),
    );

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [files, [countRow]] = await Promise.all([
      this.db
        .select()
        .from(FileRepository.table)
        .where(where)
        .orderBy(desc(FileRepository.table.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(FileRepository.table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { files, lastPage };
  }

  public async countByLocation(where: {
    clientId: number;
    folderId: number | null;
    userId: string;
    search?: string;
  }) {
    const conditions = [
      eq(FileRepository.table.clientId, where.clientId),
      where.folderId === null
        ? isNull(FileRepository.table.folderId)
        : eq(FileRepository.table.folderId, where.folderId),
      eq(FileRepository.table.userId, where.userId),
    ];
    if (where.search) {
      conditions.push(ilike(FileRepository.table.name, `%${where.search}%`));
    }

    const [row] = await this.db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(FileRepository.table)
      .where(and(...conditions));

    return row?.count ?? 0;
  }

  public async listTopByLocation(
    where: {
      clientId: number;
      folderId: number | null;
      userId: string;
      search?: string;
    },
    limit: number,
  ) {
    const conditions = [
      eq(FileRepository.table.clientId, where.clientId),
      where.folderId === null
        ? isNull(FileRepository.table.folderId)
        : eq(FileRepository.table.folderId, where.folderId),
      eq(FileRepository.table.userId, where.userId),
    ];
    if (where.search) {
      conditions.push(ilike(FileRepository.table.name, `%${where.search}%`));
    }

    return await this.db
      .select()
      .from(FileRepository.table)
      .where(and(...conditions))
      .orderBy(desc(FileRepository.table.createdAt))
      .limit(limit);
  }

  public async sumSizeGroupedByFolder(where: {
    clientId: number;
    userId: string;
  }) {
    const rows = await this.db
      .select({
        folderId: FileRepository.table.folderId,
        total: sql`COALESCE(SUM(${FileRepository.table.sizeBytes}), 0)`.mapWith(
          Number,
        ),
      })
      .from(FileRepository.table)
      .where(
        and(
          eq(FileRepository.table.clientId, where.clientId),
          eq(FileRepository.table.userId, where.userId),
        ),
      )
      .groupBy(FileRepository.table.folderId);

    return new Map(
      rows
        .filter(
          (row): row is { folderId: number; total: number } =>
            row.folderId !== null,
        )
        .map((row) => [row.folderId, row.total]),
    );
  }

  public async existsByName(where: {
    clientId: number;
    folderId: number | null;
    userId: string;
    name: string;
  }) {
    const [row] = await this.db
      .select({ fileId: FileRepository.table.fileId })
      .from(FileRepository.table)
      .where(
        and(
          eq(FileRepository.table.clientId, where.clientId),
          eq(FileRepository.table.userId, where.userId),
          eq(FileRepository.table.name, where.name),
          where.folderId === null
            ? isNull(FileRepository.table.folderId)
            : eq(FileRepository.table.folderId, where.folderId),
        ),
      )
      .limit(1);

    return !!row;
  }

  public async create(
    input: Omit<FileInsert, "fileId" | "createdAt" | "updatedAt">,
  ) {
    const [file] = await this.db
      .insert(FileRepository.table)
      .values(input)
      .returning();

    return file!;
  }

  public async update(
    where: { fileId: number; clientId: number; userId: string },
    input: { name: string },
  ) {
    const [file] = await this.db
      .update(FileRepository.table)
      .set(input)
      .where(
        and(
          eq(FileRepository.table.fileId, where.fileId),
          eq(FileRepository.table.clientId, where.clientId),
          eq(FileRepository.table.userId, where.userId),
        ),
      )
      .returning();

    return file || null;
  }

  public async removeByFileId(where: { fileId: number }) {
    await this.db
      .delete(FileRepository.table)
      .where(eq(FileRepository.table.fileId, where.fileId));
  }
}
