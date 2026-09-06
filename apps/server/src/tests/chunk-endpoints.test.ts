import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { TestStorage } from "./helpers/billing";

const chunkSchema = z.object({
  chunkId: z.number().int().positive(),
  fileId: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  content: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const chunkListSchema = z.object({
  chunks: z.array(chunkSchema),
});

const chunkResultSchema = z.object({
  chunkCount: z.number().int().nonnegative(),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("POST /clients/:clientId/files/:fileId/chunks", () => {
  test("chunks a text file into ordered pieces with content preserved", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-happy@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain;charset=utf-8",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        {
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );
      const body = await parseJson(response, chunkResultSchema);

      expect(response.status).toBe(201);
      expect(body.chunkCount).toBeGreaterThan(0);

      // Round-trip: query the chunk repository directly, don't just trust
      // the response.
      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(body.chunkCount);
      expect(rows[0]?.content).toBe("test file content");
      expect(rows[0]?.position).toBe(0);
      expect(rows.map((row) => row.position)).toEqual(
        rows.map((_, index) => index),
      );
    });
  });

  test("rejects a non-text/plain file with 400 and writes nothing", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-bad-type@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.pdf",
        mimeType: "application/pdf",
        name: "report.pdf",
        sizeBytes: 1024,
        url: "https://storage.test/report.pdf",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        {
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );

      expect(response.status).toBe(400);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a file not owned by the requesting user with 404 and writes nothing", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "chunk-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "chunk-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain;charset=utf-8",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        {
          headers: { Cookie: attacker.cookie },
          method: "POST",
        },
      );

      expect(response.status).toBe(404);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(0);
    });
  });

  test("re-running chunking replaces prior chunks instead of duplicating", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-rerun@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain;charset=utf-8",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const first = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );
      const firstBody = await parseJson(first, chunkResultSchema);

      const second = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );
      const secondBody = await parseJson(second, chunkResultSchema);

      expect(secondBody.chunkCount).toBe(firstBody.chunkCount);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(firstBody.chunkCount);
    });
  });

  test("splits a file larger than one chunk into multiple ordered, overlapping chunks", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-multi@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "long.txt",
        sizeBytes: 1801,
        url: "https://storage.test/long.txt",
        userId: authenticated.user.userId,
      });

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      const content = Array.from({ length: 1801 }, (_, i) =>
        (i % 10).toString(),
      ).join("");
      context.storage.content = content;

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );
      const body = await parseJson(response, chunkResultSchema);

      expect(response.status).toBe(201);
      expect(body.chunkCount).toBe(3);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(3);
      expect(rows[0]?.content).toBe(content.slice(0, 1000));
      expect(rows[1]?.content).toBe(content.slice(800, 1800));
      expect(rows[2]?.content).toBe(content.slice(1600, 1801));
      expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
    });
  });

  test("chunking an empty file produces zero chunks and clears any prior chunks", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-empty@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "empty.txt",
        sizeBytes: 0,
        url: "https://storage.test/empty.txt",
        userId: authenticated.user.userId,
      });
      // Seed a prior chunk directly to prove the empty re-chunk clears it.
      await context.repositories.chunk.createMany([
        {
          fileId: file.fileId,
          position: 0,
          content: "stale chunk",
          embedding: (await context.embeddings.embed({ texts: ["stale"] }))
            .vectors[0]!,
        },
      ]);

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      context.storage.content = "   \n\t  ";

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );
      const body = await parseJson(response, chunkResultSchema);

      expect(response.status).toBe(201);
      expect(body.chunkCount).toBe(0);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a non-numeric fileId param with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-invalid-id@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/not-a-number/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );

      expect(response.status).toBe(400);
    });
  });

  test("rejects chunking a file that belongs to a different client than the one in the URL, even when owned by the same user", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-cross-client@example.com",
      });
      const clientA = await context.repositories.client.create({
        email: "a@example.com",
        name: "Client A",
        userId: authenticated.user.userId,
      });
      const clientB = await context.repositories.client.create({
        email: "b@example.com",
        name: "Client B",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: clientA.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${clientB.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );

      expect(response.status).toBe(404);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: file.fileId,
      });
      expect(rows).toHaveLength(0);
    });
  });
});

describe("GET /clients/:clientId/files/:fileId/chunks", () => {
  test("lists chunks ordered by position, without embedding vectors in the response", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-list@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain;charset=utf-8",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie }, method: "POST" },
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, chunkListSchema);

      expect(response.status).toBe(200);
      expect(body.chunks.length).toBeGreaterThan(0);
      expect(body.chunks.map((chunk) => chunk.position)).toEqual(
        body.chunks.map((_, index) => index),
      );

      const rawBody = (await (
        await authenticated.app.request(
          `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
          { headers: { Cookie: authenticated.cookie } },
        )
      ).json()) as { chunks: Record<string, unknown>[] };
      expect(rawBody.chunks[0]?.embedding).toBeUndefined();
    });
  });

  test("returns an empty chunks array for a file that has never been chunked", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-list-empty@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, chunkListSchema);

      expect(response.status).toBe(200);
      expect(body.chunks).toHaveLength(0);
    });
  });

  test("rejects listing chunks for a file not owned by the requesting user with 404", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "chunk-list-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "chunk-list-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 18,
        url: "https://storage.test/notes.txt",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/chunks`,
        { headers: { Cookie: attacker.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });
});
