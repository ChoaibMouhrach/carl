import {
  chunksTable,
  filesTable,
  type ChunkInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { and, asc, cosineDistance, eq } from "drizzle-orm";

export class ChunkRepository extends BaseRepository {
  public static table = chunksTable;

  public async createMany(
    input: Omit<ChunkInsert, "chunkId" | "createdAt" | "updatedAt">[],
  ) {
    if (input.length === 0) return [];

    return await this.db
      .insert(ChunkRepository.table)
      .values(input)
      .returning();
  }

  public async listByFileId(where: { fileId: number }) {
    return await this.db
      .select()
      .from(ChunkRepository.table)
      .where(eq(ChunkRepository.table.fileId, where.fileId))
      .orderBy(asc(ChunkRepository.table.position));
  }

  public async removeByFileId(where: { fileId: number }) {
    await this.db
      .delete(ChunkRepository.table)
      .where(eq(ChunkRepository.table.fileId, where.fileId));
  }

  public async searchByClient(where: {
    clientId: number;
    userId: string;
    queryVector: number[];
    limit: number;
  }) {
    return await this.db
      .select({
        chunkId: ChunkRepository.table.chunkId,
        fileId: filesTable.fileId,
        fileName: filesTable.name,
        content: ChunkRepository.table.content,
        position: ChunkRepository.table.position,
        distance: cosineDistance(
          ChunkRepository.table.embedding,
          where.queryVector,
        ).mapWith(Number),
      })
      .from(ChunkRepository.table)
      .innerJoin(
        filesTable,
        eq(ChunkRepository.table.fileId, filesTable.fileId),
      )
      .where(
        and(
          eq(filesTable.clientId, where.clientId),
          eq(filesTable.userId, where.userId),
        ),
      )
      .orderBy(
        cosineDistance(ChunkRepository.table.embedding, where.queryVector),
      )
      .limit(where.limit);
  }
}
