import { index, integer, pgTable, text, vector } from "drizzle-orm/pg-core";
import { id, timestamps } from "../utils";
import { filesTable } from "./files";

export const chunksTable = pgTable(
  "chunks",
  {
    chunkId: id(),
    fileId: integer()
      .notNull()
      .references(() => filesTable.fileId, { onDelete: "cascade" }),
    position: integer().notNull(),
    content: text().notNull(),
    embedding: vector({ dimensions: 1536 }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type ChunksTable = typeof chunksTable;
export type Chunk = ChunksTable["$inferSelect"];
export type ChunkInsert = ChunksTable["$inferInsert"];
