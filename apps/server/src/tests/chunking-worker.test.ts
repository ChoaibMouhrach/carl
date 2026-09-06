import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ChunkingWorker } from "@server/workers/chunking";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { TestStorage } from "./helpers/billing";
import {
  buildMinimalDocx,
  buildMinimalPdf,
  buildMinimalXlsx,
} from "./helpers/document-fixtures";

const multipartInitSchema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      signedUrl: z.string().min(1),
    }),
  ),
});

const fileSchema = z.object({
  fileId: z.number().int().positive(),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("automatic chunking on upload", () => {
  test("uploading a text/plain file enqueues a chunking job that produces chunks", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-upload@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello from the worker test"], "notes.txt", {
          type: "text/plain",
        }),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files`,
        {
          body: formData,
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: body.fileId,
      });
      expect(rows.length).toBeGreaterThan(0);
      // TestStorage.downloadFile always returns this fixed content,
      // regardless of what was actually uploaded.
      expect(rows[0]?.content).toBe("test file content");
    });
  });

  test("uploading a pdf file enqueues a chunking job that extracts and stores its text", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      context.storage.content = buildMinimalPdf("hello from a worker pdf");

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-pdf@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const formData = new FormData();
      formData.append(
        "file",
        new File(["placeholder"], "report.pdf", {
          type: "application/pdf",
        }),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files`,
        {
          body: formData,
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: body.fileId,
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]?.content).toContain("hello from a worker pdf");
    });
  });

  test("uploading a docx file enqueues a chunking job that extracts and stores its text", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      context.storage.content = buildMinimalDocx("hello from a worker docx");

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-docx@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const formData = new FormData();
      formData.append(
        "file",
        new File(["placeholder"], "report.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files`,
        {
          body: formData,
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: body.fileId,
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]?.content).toContain("hello from a worker docx");
    });
  });

  test("uploading an xlsx file enqueues a chunking job that extracts and stores its text", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      context.storage.content = buildMinimalXlsx("hello from a worker xlsx");

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-xlsx@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const formData = new FormData();
      formData.append(
        "file",
        new File(["placeholder"], "report.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files`,
        {
          body: formData,
          headers: { Cookie: authenticated.cookie },
          method: "POST",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: body.fileId,
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]?.content).toContain("hello from a worker xlsx");
    });
  });

  test("uploading a file whose reported mimeType isn't chunkable does not enqueue a chunking job", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-skip@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      // Sent through the JSON multipart-init/complete flow rather than a
      // real multipart form body: Bun's FormData/Request round-trip sniffs
      // File#type from the filename extension, so a mismatched mimeType
      // can't survive an actual form upload in this test environment.
      const initResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart`,
        {
          body: JSON.stringify({
            mimeType: "application/octet-stream",
            name: "report.pdf",
            sizeBytes: 1024,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const init = await parseJson(initResponse, multipartInitSchema);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart/complete`,
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/octet-stream",
            name: init.name,
            parts: init.parts.map((part) => ({
              eTag: `etag-${part.partNumber}`,
              partNumber: part.partNumber,
            })),
            sizeBytes: 1024,
            uploadId: init.uploadId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );

      expect(response.status).toBe(201);

      const counts = await context.queueHub.chunking.getCounts();
      expect(counts.completed).toBe(0);
      expect(counts.failed).toBe(0);
    });
  });

  test("completing a multipart upload of a text file also triggers chunking", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-multipart@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const initResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart`,
        {
          body: JSON.stringify({
            mimeType: "text/plain",
            name: "agreement.txt",
            sizeBytes: 1024,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const init = await parseJson(initResponse, multipartInitSchema);

      const completeResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart/complete`,
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "text/plain",
            name: init.name,
            parts: init.parts.map((part) => ({
              eTag: `etag-${part.partNumber}`,
              partNumber: part.partNumber,
            })),
            sizeBytes: 1024,
            uploadId: init.uploadId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const completed = await parseJson(completeResponse, fileSchema);

      expect(completeResponse.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: completed.fileId,
      });
      expect(rows.length).toBeGreaterThan(0);
      // TestStorage.downloadFile always returns this fixed content.
      expect(rows[0]?.content).toBe("test file content");
    });
  });

  test("does not enqueue a chunking job for a mimeType that merely contains text/plain but doesn't start with it", async () => {
    await withTestDatabase(async ({ context }) => {
      await new ChunkingWorker({ context }).run();

      const authenticated = await createAuthenticatedApp({
        context,
        email: "chunk-worker-substring@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const initResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart`,
        {
          body: JSON.stringify({
            mimeType: "faketext/plain",
            name: "notes.txt",
            sizeBytes: 1024,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const init = await parseJson(initResponse, multipartInitSchema);

      const completeResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/multipart/complete`,
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "faketext/plain",
            name: init.name,
            parts: init.parts.map((part) => ({
              eTag: `etag-${part.partNumber}`,
              partNumber: part.partNumber,
            })),
            sizeBytes: 1024,
            uploadId: init.uploadId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const completed = await parseJson(completeResponse, fileSchema);

      expect(completeResponse.status).toBe(201);

      const rows = await context.repositories.chunk.listByFileId({
        fileId: completed.fileId,
      });
      expect(rows.length).toBe(0);

      const counts = await context.queueHub.chunking.getCounts();
      expect(counts.completed).toBe(0);
      expect(counts.failed).toBe(0);
    });
  });
});
