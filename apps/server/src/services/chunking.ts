import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";
import { CHUNKABLE_MIME_TYPES } from "@server/config/constants";

const CHUNK_SIZE_CHARS = 1_000;
const CHUNK_OVERLAP_CHARS = 200;

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Browsers and upload clients often append a charset, e.g.
// "text/plain;charset=utf-8" — compare on the bare mime type only.
const normalizeMimeType = (mimeType: string) =>
  mimeType.split(";")[0]!.trim().toLowerCase();

export const isChunkableMimeType = (mimeType: string): boolean =>
  CHUNKABLE_MIME_TYPES.includes(normalizeMimeType(mimeType));

export const extractText = async (
  mimeType: string,
  body: Buffer,
): Promise<string> => {
  const normalized = normalizeMimeType(mimeType);

  if (normalized === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(body));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  if (normalized === DOCX_MIME_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer: body });
    return value;
  }

  if (normalized === XLSX_MIME_TYPE) {
    const workbook = XLSX.read(body, { type: "buffer" });
    return workbook.SheetNames.map((name) =>
      XLSX.utils.sheet_to_csv(workbook.Sheets[name]!),
    ).join("\n\n");
  }

  return body.toString("utf-8");
};

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

    if (!isChunkableMimeType(file.mimeType)) {
      throw new BadRequestError({
        message: "This file type can't be chunked.",
      });
    }

    const { body } = await this.context.storage.downloadFile({
      key: file.key,
    });
    const text = await extractText(file.mimeType, body);
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
