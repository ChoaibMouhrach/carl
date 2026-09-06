import { BadRequestError, NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";

const CHUNK_SIZE_CHARS = 1_000;
const CHUNK_OVERLAP_CHARS = 200;

export class ChunkingService extends BaseService {
  public async chunk(where: {
    clientId: number;
    userId: string;
    fileId: number;
  }) {
    const file = await this.context.repositories.file.findScoped(where);

    if (!file) {
      throw new NotFoundError({ message: "File not found." });
    }

    if (!file.mimeType.startsWith("text/plain")) {
      throw new BadRequestError({
        message: "Only plain text files can be chunked.",
      });
    }

    const { body } = await this.context.storage.downloadFile({
      key: file.key,
    });
    const text = body.toString("utf-8");
    const pieces = this.splitText(text);

    const vectors =
      pieces.length > 0
        ? (await this.context.embeddings.embed({ texts: pieces })).vectors
        : [];

    const chunkCount = await this.context.repositories.transaction(
      async ({ tx }) => {
        await tx.chunk.removeByFileId({ fileId: file.fileId });

        const created = await tx.chunk.createMany(
          pieces.map((content, index) => ({
            fileId: file.fileId,
            position: index,
            content,
            embedding: vectors[index]!,
          })),
        );

        return created.length;
      },
    );

    return { chunkCount };
  }

  public async list(where: {
    clientId: number;
    userId: string;
    fileId: number;
  }) {
    const file = await this.context.repositories.file.findScoped(where);

    if (!file) {
      throw new NotFoundError({ message: "File not found." });
    }

    const chunks = await this.context.repositories.chunk.listByFileId({
      fileId: file.fileId,
    });

    return {
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        fileId: chunk.fileId,
        position: chunk.position,
        content: chunk.content,
        createdAt: chunk.createdAt,
        updatedAt: chunk.updatedAt,
      })),
    };
  }

  public async search(where: {
    clientId: number;
    userId: string;
    query: string;
    limit?: number;
  }) {
    const { vectors } = await this.context.embeddings.embed({
      texts: [where.query],
    });
    const queryVector = vectors[0]!;

    const results = await this.context.repositories.chunk.searchByClient({
      clientId: where.clientId,
      userId: where.userId,
      queryVector,
      limit: where.limit ?? 5,
    });

    return {
      results: results.map((result) => ({
        ...result,
        similarity: 1 - result.distance,
      })),
    };
  }

  private splitText(text: string): string[] {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];

    const pieces: string[] = [];
    const step = CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS;

    for (let start = 0; start < trimmed.length; start += step) {
      pieces.push(trimmed.slice(start, start + CHUNK_SIZE_CHARS));
      if (start + CHUNK_SIZE_CHARS >= trimmed.length) break;
    }

    return pieces;
  }
}
