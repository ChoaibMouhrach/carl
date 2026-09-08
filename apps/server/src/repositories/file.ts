import {
  filesTable,
  type FileInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { and, desc, eq, ilike, sql } from "drizzle-orm";

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

  public async findScoped(where: { fileId: number; userId: string }) {
    const [file] = await this.db
      .select()
      .from(FileRepository.table)
      .where(
        and(
          eq(FileRepository.table.fileId, where.fileId),
          eq(FileRepository.table.userId, where.userId),
        ),
      )
      .limit(1);

    return file || null;
  }

  public async listByUser(query: {
    userId: string;
    page: number;
    search?: string;
  }) {
    const conditions = [eq(FileRepository.table.userId, query.userId)];
    if (query.search) {
      conditions.push(ilike(FileRepository.table.name, `%${query.search}%`));
    }
    const where = and(...conditions);

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

  public async existsByName(where: { userId: string; name: string }) {
    const [row] = await this.db
      .select({ fileId: FileRepository.table.fileId })
      .from(FileRepository.table)
      .where(
        and(
          eq(FileRepository.table.userId, where.userId),
          eq(FileRepository.table.name, where.name),
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
    where: { fileId: number; userId: string },
    input: { name: string },
  ) {
    const [file] = await this.db
      .update(FileRepository.table)
      .set(input)
      .where(
        and(
          eq(FileRepository.table.fileId, where.fileId),
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
