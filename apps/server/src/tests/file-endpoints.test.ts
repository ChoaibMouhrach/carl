import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { filesTable } from "@server/infrastructure/database/schemas";
import {
  MAX_FILE_SIZE_BYTES,
  MULTIPART_PART_SIZE_BYTES,
} from "@repo/constants/files";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { TestStorage } from "./helpers/billing";

const fileSchema = z.object({
  createdAt: z.coerce.date(),
  fileId: z.number().int().positive(),
  key: z.string().min(1),
  metaData: z.unknown().nullable(),
  mimeType: z.string().min(1),
  name: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  updatedAt: z.coerce.date(),
  url: z.string().min(1),
  userId: z.string().min(1),
});

const fileListSchema = z.object({
  files: z.array(fileSchema),
  meta: z.object({
    lastPage: z.number().int().positive(),
    page: z.number().int().positive(),
  }),
});

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

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("POST /files/multipart", () => {
  test("creates one presigned part URL per part and writes no DB row", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init@example.com",
      });
      const sizeBytes = MULTIPART_PART_SIZE_BYTES * 2 + 1;

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: "agreement.pdf",
          sizeBytes,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const body = await parseJson(response, multipartInitSchema);

      expect(response.status).toBe(201);
      expect(body.parts).toHaveLength(3);
      expect(body.parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);

      const rows = await db.select().from(filesTable);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a file larger than the maximum size and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-oversized@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: "huge.pdf",
          sizeBytes: MAX_FILE_SIZE_BYTES + 1,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a disallowed file extension and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-bad-extension@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/x-msdownload",
          name: "virus.exe",
          sizeBytes: 1024,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("returns exactly one part when sizeBytes is one part or smaller", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-single-part@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: "agreement.pdf",
          sizeBytes: 1024,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const body = await parseJson(response, multipartInitSchema);

      expect(body.parts).toHaveLength(1);
      expect(body.parts[0]?.partNumber).toBe(1);
    });
  });

  test("returns exactly two parts when sizeBytes is an exact multiple of the part size", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-exact-multiple@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: "agreement.pdf",
          sizeBytes: MULTIPART_PART_SIZE_BYTES * 2,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const body = await parseJson(response, multipartInitSchema);

      expect(body.parts).toHaveLength(2);
    });
  });

  test("rejects a sizeBytes of zero", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-zero-size@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: "agreement.pdf",
          sizeBytes: 0,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a name longer than 255 characters on multipart init", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-init-long-name@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({
          mimeType: "application/pdf",
          name: `${"a".repeat(252)}.pdf`,
          sizeBytes: 1024,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("POST /files/multipart/complete", () => {
  test("persists the file with the exact fields once all parts are reported", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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
        "/api/files/multipart/complete",
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/pdf",
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
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.url).toBe("https://storage.test/file");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        key: init.key,
        mimeType: "application/pdf",
        name: "agreement.pdf",
        sizeBytes: 1024,
        userId: authenticated.user.userId,
      });
    });
  });

  test("re-runs filename dedupe at complete time, not the stale name from init", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete-dedupe@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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

      // Another file with the same name lands for this user during the
      // upload window, after init previewed the name but before complete.
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "application/pdf",
        name: "agreement.pdf",
        sizeBytes: 100,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        "/api/files/multipart/complete",
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/pdf",
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
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe("agreement (1).pdf");
    });
  });

  test("rejects a disallowed file extension and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete-bad-extension@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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
        "/api/files/multipart/complete",
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/x-msdownload",
            name: "virus.exe",
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
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects an empty parts array and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete-empty-parts@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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
        "/api/files/multipart/complete",
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/pdf",
            name: init.name,
            parts: [],
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
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a file larger than the maximum size and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete-oversized@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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
        "/api/files/multipart/complete",
        {
          body: JSON.stringify({
            key: init.key,
            mimeType: "application/pdf",
            name: init.name,
            parts: init.parts.map((part) => ({
              eTag: `etag-${part.partNumber}`,
              partNumber: part.partNumber,
            })),
            sizeBytes: MAX_FILE_SIZE_BYTES + 1,
            uploadId: init.uploadId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("generates a unique name correctly for a file whose name is only an extension, not a base+extension", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-complete-dotfile@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "text/plain",
        name: ".txt",
        sizeBytes: 100,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "text/plain",
            name: ".txt",
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
        "/api/files/multipart/complete",
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
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe(" (1).txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]?.name).toBe(" (1).txt");
    });
  });
});

describe("DELETE /files/multipart", () => {
  test("aborts the upload in storage and writes no DB row", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-abort@example.com",
      });

      const initResponse = await authenticated.app.request(
        "/api/files/multipart",
        {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
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

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({ key: init.key, uploadId: init.uploadId }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "DELETE",
      });

      expect(response.status).toBe(204);

      if (!(context.storage instanceof TestStorage)) {
        throw new Error("Expected the test context to use TestStorage.");
      }
      expect(context.storage.abortCalls).toContainEqual({
        key: init.key,
        uploadId: init.uploadId,
      });

      const rows = await db.select().from(filesTable);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects aborting with a missing uploadId or key", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "multipart-abort-missing-fields@example.com",
      });

      const response = await authenticated.app.request("/api/files/multipart", {
        body: JSON.stringify({ key: "", uploadId: "" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });
  });
});

describe("POST /files", () => {
  test("uploads a file directly and persists it with its real byte size", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload@example.com",
      });
      const content = "hello world";
      const formData = new FormData();
      formData.append(
        "file",
        new File([content], "notes.txt", { type: "text/plain" }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        name: "notes.txt",
        sizeBytes: content.length,
        url: "https://storage.test/file",
        userId: authenticated.user.userId,
      });
      expect(body.mimeType).toStartWith("text/plain");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "notes.txt",
        sizeBytes: content.length,
      });
    });
  });

  test("rejects a disallowed file extension and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-bad-extension@example.com",
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["MZ"], "virus.exe", {
          type: "application/x-msdownload",
        }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("auto-suffixes the name with (1) when a file with the same name already exists for this user", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe("notes (1).txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]?.name).toBe("notes (1).txt");
    });
  });

  test("increments the suffix to (2) when a third upload shares the same name", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe-2@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        key: "existing-key-2",
        mimeType: "text/plain",
        name: "notes (1).txt",
        sizeBytes: 5,
        url: "https://storage.test/existing-2",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe("notes (2).txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]?.name).toBe("notes (2).txt");
    });
  });

  test("inserts the duplicate suffix before the extension, not after it", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe-ext@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "application/pdf",
        name: "agreement.final.pdf",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "agreement.final.pdf", {
          type: "application/pdf",
        }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe("agreement.final (1).pdf");
    });
  });

  test("does not suffix the name when a same-named file exists only for a different user", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const other = await createAuthenticatedApp({
        context,
        email: "upload-dedupe-other-user@example.com",
      });
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe-this-user@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: other.user.userId,
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      const response = await authenticated.app.request("/api/files", {
        body: formData,
        headers: { Cookie: authenticated.cookie },
        method: "POST",
      });
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(201);
      expect(body.name).toBe("notes.txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]?.name).toBe("notes.txt");
    });
  });

  // Dropped "no extension" dedup case: the file validator rejects any name without an extension before it reaches FileService.
});

describe("GET /files", () => {
  test("scopes results to the requesting user and paginates", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "list-files@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "list-files-other@example.com",
      });

      for (let index = 0; index < 13; index += 1) {
        await context.repositories.file.create({
          key: `key-${index}`,
          mimeType: "text/plain",
          name: `File ${index}.txt`,
          sizeBytes: 10,
          url: `https://storage.test/${index}`,
          userId: authenticated.user.userId,
        });
      }
      await context.repositories.file.create({
        key: "key-other-user",
        mimeType: "text/plain",
        name: "Other.txt",
        sizeBytes: 10,
        url: "https://storage.test/other",
        userId: other.user.userId,
      });

      const firstPageResponse = await authenticated.app.request(
        "/api/files?page=1",
        { headers: { Cookie: authenticated.cookie } },
      );
      const firstPage = await parseJson(firstPageResponse, fileListSchema);

      expect(firstPage.files).toHaveLength(12);
      expect(firstPage.meta).toEqual({ lastPage: 2, page: 1 });
      expect(
        firstPage.files.every(
          (file) => file.userId === authenticated.user.userId,
        ),
      ).toBe(true);

      const secondPageResponse = await authenticated.app.request(
        "/api/files?page=2",
        { headers: { Cookie: authenticated.cookie } },
      );
      const secondPage = await parseJson(secondPageResponse, fileListSchema);

      expect(secondPage.files).toHaveLength(1);
      expect(secondPage.meta).toEqual({ lastPage: 2, page: 2 });
    });
  });

  test("returns an empty list when the user has no files", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "empty-files@example.com",
      });

      const response = await authenticated.app.request("/api/files", {
        headers: { Cookie: authenticated.cookie },
      });
      const body = await parseJson(response, fileListSchema);

      expect(body.files).toEqual([]);
      expect(body.meta).toEqual({ lastPage: 1, page: 1 });
    });
  });
});

describe("DELETE /files/:fileId", () => {
  test("removes only the caller's own file, rejects deleting another user's, and is not idempotent past the first call", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "remove-owner@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "remove-other@example.com",
      });
      const ownFile = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });
      const foreignFile = await context.repositories.file.create({
        key: "foreign-key",
        mimeType: "text/plain",
        name: "foreign.txt",
        sizeBytes: 10,
        url: "https://storage.test/foreign",
        userId: other.user.userId,
      });

      const foreignDeleteResponse = await owner.app.request(
        `/api/files/${foreignFile.fileId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const foreignRowAfterAttempt = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, foreignFile.fileId));

      expect(foreignDeleteResponse.status).toBe(404);
      expect(foreignRowAfterAttempt).toHaveLength(1);

      const deleteResponse = await owner.app.request(
        `/api/files/${ownFile.fileId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const ownRowAfter = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, ownFile.fileId));

      expect(deleteResponse.status).toBe(204);
      expect(ownRowAfter).toHaveLength(0);

      const secondDeleteResponse = await owner.app.request(
        `/api/files/${ownFile.fileId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );

      expect(secondDeleteResponse.status).toBe(404);
    });
  });

  test("rejects a non-numeric fileId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-file-id@example.com",
      });
      await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(filesTable);

      const response = await authenticated.app.request(
        "/api/files/not-a-number",
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const after = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

describe("PATCH /files/:fileId", () => {
  test("renames only the caller's own file and persists the exact new name", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-owner@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/files/${file.fileId}`,
        {
          body: JSON.stringify({ name: "new-name.txt" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(200);
      expect(body.name).toBe("new-name.txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, file.fileId));
      expect(rows[0]?.name).toBe("new-name.txt");
      expect(rows[0]?.key).toBe("own-key");
    });
  });

  test("rejects renaming another user's file and leaves it unchanged", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "patch-owner-2@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "patch-attacker@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(`/api/files/${file.fileId}`, {
        body: JSON.stringify({ name: "hijacked.txt" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: attacker.cookie,
        },
        method: "PATCH",
      });
      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, file.fileId));

      expect(response.status).toBe(404);
      expect(rows[0]?.name).toBe("old-name.txt");
    });
  });

  test("rejects an invalid payload (empty name or disallowed extension) and leaves the file unchanged", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-invalid-payload@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const emptyNameResponse = await authenticated.app.request(
        `/api/files/${file.fileId}`,
        {
          body: JSON.stringify({ name: "" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );

      expect(emptyNameResponse.status).toBe(400);

      const badExtensionResponse = await authenticated.app.request(
        `/api/files/${file.fileId}`,
        {
          body: JSON.stringify({ name: "virus.exe" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );

      expect(badExtensionResponse.status).toBe(400);

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, file.fileId));
      expect(rows[0]?.name).toBe("old-name.txt");
    });
  });

  test("rejects a non-numeric fileId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-invalid-id@example.com",
      });
      await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(filesTable);

      const response = await authenticated.app.request(
        "/api/files/not-a-number",
        {
          body: JSON.stringify({ name: "new-name.txt" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const after = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });

  test("allows renaming to a name that collides with another file owned by the same user (documents current behavior: no dedupe on rename)", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-collision@example.com",
      });
      await context.repositories.file.create({
        key: "existing-key",
        mimeType: "text/plain",
        name: "taken.txt",
        sizeBytes: 10,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/files/${file.fileId}`,
        {
          body: JSON.stringify({ name: "taken.txt" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const body = await parseJson(response, fileSchema);

      expect(response.status).toBe(200);
      expect(body.name).toBe("taken.txt");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.name, "taken.txt"));
      expect(rows).toHaveLength(2);
    });
  });
});

describe("GET /files/:fileId/download", () => {
  test("returns a signed download url for the caller's own file", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "download-owner@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/files/${file.fileId}/download`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(
        response,
        z.object({ signedUrl: z.string().min(1) }),
      );

      expect(response.status).toBe(200);
      expect(body).toEqual({ signedUrl: "https://storage.test/download" });
    });
  });

  test("rejects downloading another user's file", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "download-owner-2@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "download-attacker@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/files/${file.fileId}/download`,
        { headers: { Cookie: attacker.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });

  test("rejects a non-numeric fileId param with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "download-invalid-id@example.com",
      });

      const response = await authenticated.app.request(
        "/api/files/not-a-number/download",
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(400);
    });
  });
});

describe("Authentication", () => {
  test("all file endpoints reject missing authentication without changing file data", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "unauthenticated-files@example.com",
      });
      const file = await context.repositories.file.create({
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(filesTable);

      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      const requests = [
        new Request("http://localhost/api/files"),
        new Request("http://localhost/api/files/multipart", {
          body: JSON.stringify({
            mimeType: "application/pdf",
            name: "agreement.pdf",
            sizeBytes: 1024,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
        new Request("http://localhost/api/files", {
          body: formData,
          method: "POST",
        }),
        new Request(`http://localhost/api/files/${file.fileId}`, {
          method: "DELETE",
        }),
        new Request(`http://localhost/api/files/${file.fileId}`, {
          body: JSON.stringify({ name: "renamed.txt" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }),
        new Request(`http://localhost/api/files/${file.fileId}/download`),
      ];

      const responses = await Promise.all(
        requests.map(async (request) => await authenticated.app.fetch(request)),
      );
      const after = await db.select().from(filesTable);

      expect(responses.map((response) => response.status)).toEqual([
        401, 401, 401, 401, 401, 401,
      ]);
      expect(after).toEqual(before);
    });
  });
});
