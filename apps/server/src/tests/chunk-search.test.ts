import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const searchResultSchema = z.object({
  results: z.array(
    z.object({
      chunkId: z.number().int().positive(),
      fileId: z.number().int().positive(),
      fileName: z.string().min(1),
      content: z.string().min(1),
      position: z.number().int().nonnegative(),
      similarity: z.number(),
    }),
  ),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("GET /clients/:clientId/chunks/search", () => {
  test("ranks the exact-match chunk first with similarity close to 1", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-rank@example.com",
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
        sizeBytes: 10,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const query = "the search query";
      const { vectors } = await context.embeddings.embed({
        texts: [query, "something completely unrelated"],
      });

      await context.repositories.chunk.createMany([
        {
          fileId: file.fileId,
          position: 0,
          content: "an unrelated chunk",
          embedding: vectors[1]!,
        },
        {
          fileId: file.fileId,
          position: 1,
          content: "the exact match chunk",
          embedding: vectors[0]!,
        },
      ]);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=${encodeURIComponent(query)}`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(2);
      expect(body.results[0]?.content).toBe("the exact match chunk");
      expect(body.results[0]?.similarity).toBeGreaterThan(0.99);
      expect(body.results[1]?.content).toBe("an unrelated chunk");
      expect(body.results[0]!.similarity).toBeGreaterThan(
        body.results[1]!.similarity,
      );
    });
  });

  test("caps the result count via the limit query param", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-limit@example.com",
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
        sizeBytes: 10,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const { vectors } = await context.embeddings.embed({
        texts: ["chunk one", "chunk two", "chunk three"],
      });

      await context.repositories.chunk.createMany(
        vectors.map((embedding, index) => ({
          fileId: file.fileId,
          position: index,
          content: `chunk ${index}`,
          embedding,
        })),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=chunk&limit=1`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
    });
  });

  test("returns nothing when a different user searches someone else's client id directly", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "chunk-search-owner@example.com",
      });
      const intruder = await createAuthenticatedApp({
        context,
        email: "chunk-search-intruder@example.com",
      });
      const ownerClient = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: ownerClient.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "secret.txt",
        sizeBytes: 10,
        url: "https://storage.test/secret.txt",
        userId: owner.user.userId,
      });

      const { vectors } = await context.embeddings.embed({
        texts: ["confidential content"],
      });
      await context.repositories.chunk.createMany([
        {
          fileId: file.fileId,
          position: 0,
          content: "confidential content",
          embedding: vectors[0]!,
        },
      ]);

      // The intruder queries the OWNER's clientId directly, not their own.
      const response = await intruder.app.request(
        `/api/clients/${ownerClient.clientId}/chunks/search?q=confidential`,
        { headers: { Cookie: intruder.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(0);
    });
  });

  test("rejects an empty q parameter with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-empty-q@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(400);
    });
  });

  test("rejects a request with no q parameter at all with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-no-q@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(400);
    });
  });

  test("rejects a limit of zero and a limit over 20 with 400, accepts exactly 20", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-limit-bounds@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const zeroResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=chunk&limit=0`,
        { headers: { Cookie: authenticated.cookie } },
      );
      expect(zeroResponse.status).toBe(400);

      const overResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=chunk&limit=21`,
        { headers: { Cookie: authenticated.cookie } },
      );
      expect(overResponse.status).toBe(400);

      const exactResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=chunk&limit=20`,
        { headers: { Cookie: authenticated.cookie } },
      );
      expect(exactResponse.status).toBe(200);
    });
  });

  test("returns exactly 5 results by default when more than 5 chunks exist", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-default-limit@example.com",
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
        sizeBytes: 10,
        url: "https://storage.test/notes.txt",
        userId: authenticated.user.userId,
      });

      const texts = Array.from({ length: 7 }, (_, index) => `chunk ${index}`);
      const { vectors } = await context.embeddings.embed({ texts });

      await context.repositories.chunk.createMany(
        vectors.map((embedding, index) => ({
          fileId: file.fileId,
          position: index,
          content: `chunk ${index}`,
          embedding,
        })),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=chunk`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(5);
    });
  });

  test("returns nothing when the requesting user's OWN client simply has no chunks indexed yet", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-no-chunks@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/chunks/search?q=anything`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(0);
    });
  });

  test("never returns chunks from a different client owned by the same user", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-search-cross-client@example.com",
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
      const fileB = await context.repositories.file.create({
        clientId: clientB.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "secret.txt",
        sizeBytes: 10,
        url: "https://storage.test/secret.txt",
        userId: authenticated.user.userId,
      });

      const { vectors } = await context.embeddings.embed({
        texts: ["client b confidential content"],
      });
      await context.repositories.chunk.createMany([
        {
          fileId: fileB.fileId,
          position: 0,
          content: "client b confidential content",
          embedding: vectors[0]!,
        },
      ]);

      const response = await authenticated.app.request(
        `/api/clients/${clientA.clientId}/chunks/search?q=confidential`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, searchResultSchema);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(0);
    });
  });
});
