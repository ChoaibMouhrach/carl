import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  filesTable,
  foldersTable,
} from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const entrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("folder"),
    clientId: z.number().int().positive(),
    createdAt: z.coerce.date(),
    folderId: z.number().int().positive(),
    name: z.string().min(1),
    parentId: z.number().int().positive().nullable(),
    totalSizeBytes: z.number().int().nonnegative(),
    updatedAt: z.coerce.date(),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal("file"),
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
  }),
]);

const entriesListSchema = z.object({
  entries: z.array(entrySchema),
  meta: z.object({
    lastPage: z.number().int().positive(),
    page: z.number().int().positive(),
  }),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("GET /clients/:clientId/folders/:folderId/entries", () => {
  test("merges subfolders and files into one list ordered by createdAt desc", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-merge@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const parent = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const olderFile = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: parent.folderId,
        key: "older-key",
        mimeType: "text/plain",
        name: "older.txt",
        sizeBytes: 10,
        url: "https://storage.test/older",
        userId: authenticated.user.userId,
      });
      const middleFolder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Middle",
        parentId: parent.folderId,
        userId: authenticated.user.userId,
      });
      const newerFile = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: parent.folderId,
        key: "newer-key",
        mimeType: "text/plain",
        name: "newer.txt",
        sizeBytes: 10,
        url: "https://storage.test/newer",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${parent.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);

      expect(response.status).toBe(200);
      expect(
        body.entries.map((entry) =>
          entry.type === "folder" ? entry.folderId : entry.fileId,
        ),
      ).toEqual([newerFile.fileId, middleFolder.folderId, olderFile.fileId]);
    });
  });

  test("computes a folder's totalSizeBytes recursively, including files in a nested subfolder that has no direct files of its own", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-recursive-size@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Docs",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const child = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "CSV",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: child.folderId,
        key: "child-key",
        mimeType: "text/csv",
        name: "data.csv",
        sizeBytes: 2048,
        url: "https://storage.test/data",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const rootEntry = body.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === root.folderId,
      );

      expect(response.status).toBe(200);
      expect(rootEntry).toMatchObject({ totalSizeBytes: 2048 });
    });
  });

  test("sums a folder's totalSizeBytes across both its own direct files and a nested subfolder's files", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-combined-size@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Docs",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const child = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "CSV",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: root.folderId,
        key: "direct-key",
        mimeType: "application/pdf",
        name: "summary.pdf",
        sizeBytes: 100,
        url: "https://storage.test/summary",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: child.folderId,
        key: "nested-key",
        mimeType: "text/csv",
        name: "data.csv",
        sizeBytes: 2048,
        url: "https://storage.test/data",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const rootEntry = body.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === root.folderId,
      );

      expect(response.status).toBe(200);
      expect(rootEntry).toMatchObject({ totalSizeBytes: 2148 });
    });
  });

  test("rolls up totalSizeBytes through three levels of nesting (grandparent -> parent -> child)", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-three-level-size@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const grandparent = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Level1",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const parent = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Level2",
        parentId: grandparent.folderId,
        userId: authenticated.user.userId,
      });
      const child = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Level3",
        parentId: parent.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: child.folderId,
        key: "deep-key",
        mimeType: "text/plain",
        name: "deep.txt",
        sizeBytes: 500,
        url: "https://storage.test/deep",
        userId: authenticated.user.userId,
      });

      const rootResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const rootBody = await parseJson(rootResponse, entriesListSchema);
      const grandparentEntry = rootBody.entries.find(
        (entry) =>
          entry.type === "folder" && entry.folderId === grandparent.folderId,
      );

      const nestedResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${grandparent.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const nestedBody = await parseJson(nestedResponse, entriesListSchema);
      const parentEntry = nestedBody.entries.find(
        (entry) =>
          entry.type === "folder" && entry.folderId === parent.folderId,
      );

      expect(grandparentEntry).toMatchObject({ totalSizeBytes: 500 });
      expect(parentEntry).toMatchObject({ totalSizeBytes: 500 });
    });
  });

  test("keeps duplicate-named files in sibling folders separate, both in listing and in recursive folder size", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-duplicate-names@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Root",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const alpha = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Alpha",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });
      const beta = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Beta",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: alpha.folderId,
        key: "alpha-key",
        mimeType: "application/pdf",
        name: "report.pdf",
        sizeBytes: 300,
        url: "https://storage.test/alpha",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: beta.folderId,
        key: "beta-key",
        mimeType: "application/pdf",
        name: "report.pdf",
        sizeBytes: 700,
        url: "https://storage.test/beta",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${root.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const alphaEntry = body.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === alpha.folderId,
      );
      const betaEntry = body.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === beta.folderId,
      );

      expect(response.status).toBe(200);
      expect(body.entries).toHaveLength(2);
      expect(alphaEntry).toMatchObject({ totalSizeBytes: 300 });
      expect(betaEntry).toMatchObject({ totalSizeBytes: 700 });

      const rootResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const rootBody = await parseJson(rootResponse, entriesListSchema);
      const rootEntry = rootBody.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === root.folderId,
      );

      expect(rootEntry).toMatchObject({ totalSizeBytes: 1000 });
    });
  });

  test("lists two files that share an identical name in the same folder as two separate entries, not merged", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-same-folder-duplicate-name@example.com",
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
      const first = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "first-key",
        mimeType: "application/pdf",
        name: "report.pdf",
        sizeBytes: 300,
        url: "https://storage.test/first",
        userId: authenticated.user.userId,
      });
      const second = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: folder.folderId,
        key: "second-key",
        mimeType: "application/pdf",
        name: "report.pdf",
        sizeBytes: 700,
        url: "https://storage.test/second",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${folder.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const fileEntries = body.entries.filter(
        (entry): entry is typeof entry & { type: "file" } =>
          entry.type === "file",
      );

      expect(response.status).toBe(200);
      expect(fileEntries).toHaveLength(2);
      expect(fileEntries.every((entry) => entry.name === "report.pdf")).toBe(
        true,
      );
      expect(
        fileEntries.find((entry) => entry.fileId === first.fileId),
      ).toMatchObject({ sizeBytes: 300 });
      expect(
        fileEntries.find((entry) => entry.fileId === second.fileId),
      ).toMatchObject({ sizeBytes: 700 });
    });
  });

  test("excludes an orphaned file with a null clientId from a folder's recursive size even though its folderId matches a real folder", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-orphaned-file-size@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Docs",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: null,
        folderId: root.folderId,
        key: "orphaned-key",
        mimeType: "text/plain",
        name: "orphaned.txt",
        sizeBytes: 9999,
        url: "https://storage.test/orphaned",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const rootEntry = body.entries.find(
        (entry) => entry.type === "folder" && entry.folderId === root.folderId,
      );

      expect(response.status).toBe(200);
      expect(rootEntry).toMatchObject({ totalSizeBytes: 0 });
    });
  });

  test("paginates the combined folder+file list using a single shared page size", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-paginate@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const parent = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      for (let index = 0; index < 7; index += 1) {
        await context.repositories.folder.create({
          clientId: client.clientId,
          name: `Sub ${index}`,
          parentId: parent.folderId,
          userId: authenticated.user.userId,
        });
      }
      for (let index = 0; index < 7; index += 1) {
        await context.repositories.file.create({
          clientId: client.clientId,
          folderId: parent.folderId,
          key: `key-${index}`,
          mimeType: "text/plain",
          name: `File ${index}.txt`,
          sizeBytes: 10,
          url: `https://storage.test/${index}`,
          userId: authenticated.user.userId,
        });
      }

      const firstPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${parent.folderId}/entries?page=1`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const firstPage = await parseJson(firstPageResponse, entriesListSchema);

      expect(firstPage.entries).toHaveLength(12);
      expect(firstPage.meta).toEqual({ lastPage: 2, page: 1 });

      const secondPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${parent.folderId}/entries?page=2`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const secondPage = await parseJson(secondPageResponse, entriesListSchema);

      expect(secondPage.entries).toHaveLength(2);
      expect(secondPage.meta).toEqual({ lastPage: 2, page: 2 });

      const allIds = [...firstPage.entries, ...secondPage.entries].map(
        (entry) =>
          `${entry.type}-${entry.type === "folder" ? entry.folderId : entry.fileId}`,
      );
      expect(new Set(allIds).size).toBe(14);
    });
  });

  test("filters both folder names and file names via the search query param", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-search@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const parent = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Invoice Archive",
        parentId: parent.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Misc",
        parentId: parent.folderId,
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: parent.folderId,
        key: "invoice-key",
        mimeType: "application/pdf",
        name: "invoice-2024.pdf",
        sizeBytes: 10,
        url: "https://storage.test/invoice",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: parent.folderId,
        key: "other-key",
        mimeType: "text/plain",
        name: "notes.txt",
        sizeBytes: 10,
        url: "https://storage.test/notes",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${parent.folderId}/entries?search=invoice`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);

      expect(response.status).toBe(200);
      expect(body.entries.map((entry) => entry.name).sort()).toEqual([
        "Invoice Archive",
        "invoice-2024.pdf",
      ]);
    });
  });

  test("returns an empty entries array with lastPage 1 for a folder with no children", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-empty@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Empty",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${folder.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);

      expect(response.status).toBe(200);
      expect(body).toEqual({ entries: [], meta: { lastPage: 1, page: 1 } });
    });
  });

  test("rejects listing entries for another user's client and writes nothing", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "entries-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "entries-attacker@example.com",
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
        `/api/clients/${client.clientId}/folders/${folder.folderId}/entries`,
        { headers: { Cookie: attacker.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });

  test("rejects listing entries under a folder belonging to a different client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-wrong-client@example.com",
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
      const folderB = await context.repositories.folder.create({
        clientId: clientB.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${clientA.clientId}/folders/${folderB.folderId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });

  test("rejects a non-numeric folderId param with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-invalid-id@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/not-a-number/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(400);
    });
  });
});

describe("GET /clients/:clientId/entries", () => {
  test("returns only root-level folders and files for the client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "root-entries@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const rootFolder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const nestedFolder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Nested",
        parentId: rootFolder.folderId,
        userId: authenticated.user.userId,
      });
      const rootFile = await context.repositories.file.create({
        clientId: client.clientId,
        folderId: null,
        key: "root-key",
        mimeType: "text/plain",
        name: "root.txt",
        sizeBytes: 10,
        url: "https://storage.test/root",
        userId: authenticated.user.userId,
      });
      await context.repositories.file.create({
        clientId: client.clientId,
        folderId: rootFolder.folderId,
        key: "nested-key",
        mimeType: "text/plain",
        name: "nested.txt",
        sizeBytes: 10,
        url: "https://storage.test/nested",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, entriesListSchema);
      const ids = body.entries.map((entry) =>
        entry.type === "folder" ? entry.folderId : entry.fileId,
      );

      expect(response.status).toBe(200);
      expect(ids.sort()).toEqual([rootFolder.folderId, rootFile.fileId].sort());
      expect(ids).not.toContain(nestedFolder.folderId);
    });
  });

  test("rejects listing root entries for another user's client", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "root-entries-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "root-entries-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/entries`,
        { headers: { Cookie: attacker.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("Authentication", () => {
  test("both entries endpoints reject missing authentication without changing data", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "entries-unauthenticated@example.com",
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
      const beforeFolders = await db.select().from(foldersTable);
      const beforeFiles = await db.select().from(filesTable);

      const responses = await Promise.all([
        authenticated.app.fetch(
          new Request(
            `http://localhost/api/clients/${client.clientId}/folders/${folder.folderId}/entries`,
          ),
        ),
        authenticated.app.fetch(
          new Request(
            `http://localhost/api/clients/${client.clientId}/entries`,
          ),
        ),
      ]);
      const afterFolders = await db.select().from(foldersTable);
      const afterFiles = await db.select().from(filesTable);

      expect(responses.map((response) => response.status)).toEqual([401, 401]);
      expect(afterFolders).toEqual(beforeFolders);
      expect(afterFiles).toEqual(beforeFiles);
    });
  });
});
