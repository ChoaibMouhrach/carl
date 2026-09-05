import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { filesTable } from "@server/infrastructure/database/schemas";
import { MAX_FILE_SIZE_BYTES } from "@repo/constants/files";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const fileSchema = z.object({
  clientId: z.number().int().positive().nullable(),
  createdAt: z.coerce.date(),
  fileId: z.number().int().positive(),
  folderId: z.number().int().positive().nullable(),
  key: z.string().min(1),
  metaData: z.unknown().nullable(),
  mimeType: z.string().min(1),
  name: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  updatedAt: z.coerce.date(),
  url: z.string().min(1),
  userId: z.string().min(1).nullable(),
});

const fileListSchema = z.object({
  files: z.array(fileSchema),
  meta: z.object({
    lastPage: z.number().int().positive(),
    page: z.number().int().positive(),
  }),
});

const presignSchema = z.object({
  fileId: z.number().int().positive(),
  signedUrl: z.string().min(1),
  url: z.string().min(1),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("POST /clients/:clientId/files/presign", () => {
  test("creates a pending file record scoped to the folder and persists the exact fields", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "presign@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/presign`,
        {
          body: JSON.stringify({
            folderId: folder.folderId,
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
      const body = await parseJson(response, presignSchema);

      expect(response.status).toBe(201);
      expect(body.signedUrl).toBe("https://storage.test/upload");
      expect(body.url).toBe("https://storage.test/file");

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        clientId: client.clientId,
        folderId: folder.folderId,
        mimeType: "application/pdf",
        name: "agreement.pdf",
        sizeBytes: 1024,
        userId: authenticated.user.userId,
      });
    });
  });

  test("creates a root-level file when no folderId is given", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "presign-root@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/presign`,
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
      const body = await parseJson(response, presignSchema);

      expect(response.status).toBe(201);

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        clientId: client.clientId,
        folderId: null,
      });
    });
  });

  test("rejects a disallowed file extension and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "presign-bad-extension@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/presign`,
        {
          body: JSON.stringify({
            folderId: folder.folderId,
            mimeType: "application/x-msdownload",
            name: "virus.exe",
            sizeBytes: 1024,
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
        email: "presign-oversized@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/presign`,
        {
          body: JSON.stringify({
            folderId: folder.folderId,
            mimeType: "application/pdf",
            name: "huge.pdf",
            sizeBytes: MAX_FILE_SIZE_BYTES + 1,
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

  test("rejects presigning into another user's folder and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "presign-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "presign-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files/presign`,
        {
          body: JSON.stringify({
            folderId: folder.folderId,
            mimeType: "application/pdf",
            name: "agreement.pdf",
            sizeBytes: 1024,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: attacker.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(0);
    });
  });

  test("auto-suffixes the name with (1) when a file with the same name already exists at the same location", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "presign-dedupe@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key",
        mimeType: "application/pdf",
        name: "agreement.pdf",
        sizeBytes: 100,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/presign`,
        {
          body: JSON.stringify({
            folderId: folder.folderId,
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
      const body = await parseJson(response, presignSchema);

      expect(response.status).toBe(201);

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]?.name).toBe("agreement (1).pdf");
    });
  });
});

describe("POST /clients/:clientId/files", () => {
  test("uploads a file directly and persists it with its real byte size", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const content = "hello world";
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File([content], "notes.txt", { type: "text/plain" }),
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
      expect(body).toMatchObject({
        clientId: client.clientId,
        folderId: folder.folderId,
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

  test("uploads a root-level file when no folderId is given", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-root@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
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
      expect(body.folderId).toBeNull();

      const rows = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, body.fileId));
      expect(rows[0]).toMatchObject({
        clientId: client.clientId,
        folderId: null,
      });
    });
  });

  test("rejects a disallowed file extension and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-bad-extension@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File(["MZ"], "virus.exe", {
          type: "application/x-msdownload",
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
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects uploading into another user's folder and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "upload-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "upload-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: owner.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      );

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files`,
        {
          body: formData,
          headers: { Cookie: attacker.cookie },
          method: "POST",
        },
      );
      const rows = await db.select().from(filesTable);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(0);
    });
  });

  test("auto-suffixes the name with (1) when a file with the same name already exists at the same location", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key-2",
        mimeType: "text/plain",
        name: "notes (1).txt",
        sizeBytes: 5,
        url: "https://storage.test/existing-2",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key",
        mimeType: "application/pdf",
        name: "agreement.final.pdf",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folder.folderId.toString());
      formData.append(
        "file",
        new File(["hello"], "agreement.final.pdf", {
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
      expect(body.name).toBe("agreement.final (1).pdf");
    });
  });

  test("does not suffix the name when a same-named file exists only at a different location", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "upload-dedupe-diff-location@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folderA = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const folderB = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Invoices",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folderA.folderId,
        key: "existing-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 5,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const formData = new FormData();
      formData.append("folderId", folderB.folderId.toString());
      formData.append(
        "file",
        new File(["hello"], "notes.txt", { type: "text/plain" }),
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

describe("GET /clients/:clientId/files", () => {
  test("scopes results to the folder and paginates", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "list-files@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const otherFolder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Invoices",
        parentId: null,
        userId: authenticated.user.userId,
      });

      for (let index = 0; index < 13; index += 1) {
        await context.repositories.file.create({
          clientId: client.clientId,
          folderId: folder.folderId,
          key: `key-${index}`,
          mimeType: "text/plain",
          name: `File ${index}.txt`,
          sizeBytes: 10,
          url: `https://storage.test/${index}`,
          userId: authenticated.user.userId,
        });
      }
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: otherFolder.folderId,
        key: "key-other",
        mimeType: "text/plain",
        name: "Other.txt",
        sizeBytes: 10,
        url: "https://storage.test/other",
        userId: authenticated.user.userId,
      });

      const firstPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files?folderId=${folder.folderId}&page=1`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const firstPage = await parseJson(firstPageResponse, fileListSchema);

      expect(firstPage.files).toHaveLength(12);
      expect(firstPage.meta).toEqual({ lastPage: 2, page: 1 });
      expect(
        firstPage.files.every((file) => file.folderId === folder.folderId),
      ).toBe(true);

      const secondPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files?folderId=${folder.folderId}&page=2`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const secondPage = await parseJson(secondPageResponse, fileListSchema);

      expect(secondPage.files).toHaveLength(1);
      expect(secondPage.meta).toEqual({ lastPage: 2, page: 2 });
    });
  });

  test("returns an empty list for a folder with no files", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "empty-files@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files?folderId=${folder.folderId}`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, fileListSchema);

      expect(body.files).toEqual([]);
      expect(body.meta).toEqual({ lastPage: 1, page: 1 });
    });
  });

  test("lists only root-level files when folderId is omitted", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "list-root-files@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "root-key",
        mimeType: "text/plain",
        name: "Root.txt",
        sizeBytes: 10,
        url: "https://storage.test/root",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "nested-key",
        mimeType: "text/plain",
        name: "Nested.txt",
        sizeBytes: 10,
        url: "https://storage.test/nested",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, fileListSchema);

      expect(body.files.map((file) => file.name)).toEqual(["Root.txt"]);
    });
  });
});

describe("DELETE /clients/:clientId/files/:fileId", () => {
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
      const ownClient = await context.repositories.client.create({
        email: "own@example.com",
        name: "Own Client",
        userId: owner.user.userId,
      });
      const ownFolder = await context.repositories.folder.create({
        clientId: ownClient.clientId,
        name: "Contracts",
        parentId: null,
        userId: owner.user.userId,
      });
      const ownFile = await context.repositories.file.create({
        clientId: ownClient.clientId,
        folderId: ownFolder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });
      const foreignClient = await context.repositories.client.create({
        email: "foreign@example.com",
        name: "Foreign Client",
        userId: other.user.userId,
      });
      const foreignFolder = await context.repositories.folder.create({
        clientId: foreignClient.clientId,
        name: "Contracts",
        parentId: null,
        userId: other.user.userId,
      });
      const foreignFile = await context.repositories.file.create({
        clientId: foreignClient.clientId,
        folderId: foreignFolder.folderId,
        key: "foreign-key",
        mimeType: "text/plain",
        name: "foreign.txt",
        sizeBytes: 10,
        url: "https://storage.test/foreign",
        userId: other.user.userId,
      });

      const foreignDeleteResponse = await owner.app.request(
        `/api/clients/${foreignClient.clientId}/files/${foreignFile.fileId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const foreignRowAfterAttempt = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, foreignFile.fileId));

      expect(foreignDeleteResponse.status).toBe(404);
      expect(foreignRowAfterAttempt).toHaveLength(1);

      const deleteResponse = await owner.app.request(
        `/api/clients/${ownClient.clientId}/files/${ownFile.fileId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const ownRowAfter = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.fileId, ownFile.fileId));

      expect(deleteResponse.status).toBe(204);
      expect(ownRowAfter).toHaveLength(0);

      const secondDeleteResponse = await owner.app.request(
        `/api/clients/${ownClient.clientId}/files/${ownFile.fileId}`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(filesTable);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/not-a-number`,
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const after = await db.select().from(filesTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

describe("PATCH /clients/:clientId/files/:fileId", () => {
  test("renames only the caller's own file and persists the exact new name", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-owner@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}`,
        {
          body: JSON.stringify({ name: "hijacked.txt" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: attacker.cookie,
          },
          method: "PATCH",
        },
      );
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const emptyNameResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}`,
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
        `/api/clients/${client.clientId}/files/${file.fileId}`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(filesTable);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/not-a-number`,
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

  test("allows renaming to a name that collides with another file at the same location (documents current behavior: no dedupe on rename)", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "patch-collision@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "existing-key",
        mimeType: "text/plain",
        name: "taken.txt",
        sizeBytes: 10,
        url: "https://storage.test/existing",
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "old-name.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}`,
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

describe("GET /clients/:clientId/files/:fileId/download", () => {
  test("returns a signed download url for the caller's own file", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "download-owner@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/download`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "own-key",
        mimeType: "text/plain",
        name: "own.txt",
        sizeBytes: 10,
        url: "https://storage.test/own",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/files/${file.fileId}/download`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/files/not-a-number/download`,
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
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
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
        new Request(`http://localhost/api/clients/${client.clientId}/files`),
        new Request(
          `http://localhost/api/clients/${client.clientId}/files/presign`,
          {
            body: JSON.stringify({
              folderId: folder.folderId,
              mimeType: "application/pdf",
              name: "agreement.pdf",
              sizeBytes: 1024,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        ),
        new Request(`http://localhost/api/clients/${client.clientId}/files`, {
          body: formData,
          method: "POST",
        }),
        new Request(
          `http://localhost/api/clients/${client.clientId}/files/${file.fileId}`,
          { method: "DELETE" },
        ),
        new Request(
          `http://localhost/api/clients/${client.clientId}/files/${file.fileId}`,
          {
            body: JSON.stringify({ name: "renamed.txt" }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
        ),
        new Request(
          `http://localhost/api/clients/${client.clientId}/files/${file.fileId}/download`,
        ),
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
