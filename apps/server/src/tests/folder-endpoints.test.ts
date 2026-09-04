import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { foldersTable } from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const folderSchema = z.object({
  clientId: z.number().int().positive(),
  createdAt: z.coerce.date(),
  folderId: z.number().int().positive(),
  name: z.string().min(1),
  parentId: z.number().int().positive().nullable(),
  updatedAt: z.coerce.date(),
  userId: z.string().min(1),
});

const folderListSchema = z.object({
  folders: z.array(folderSchema),
  meta: z.object({
    lastPage: z.number().int().positive(),
    page: z.number().int().positive(),
  }),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("POST /clients/:clientId/folders", () => {
  test("creates a root folder scoped to the caller and client", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "root-folder@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({ name: "Contracts" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const body = await parseJson(response, folderSchema);

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const rows = await db
        .select()
        .from(foldersTable)
        .where(eq(foldersTable.folderId, body.folderId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "Contracts", parentId: null });
    });
  });

  test("creates a nested subfolder under an existing folder of the same client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "nested-folder@example.com",
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

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({
            name: "2026",
            parentId: parent.folderId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const body = await parseJson(response, folderSchema);

      expect(response.status).toBe(201);
      expect(body).toMatchObject({ name: "2026", parentId: parent.folderId });
    });
  });

  test("rejects creating a folder under another client's folder", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "cross-client@example.com",
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
      const folderUnderA = await context.repositories.folder.create({
        clientId: clientA.clientId,
        name: "A Folder",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${clientB.clientId}/folders`,
        {
          body: JSON.stringify({
            name: "Leaked",
            parentId: folderUnderA.folderId,
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(foldersTable);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(1);
    });
  });

  test("rejects creating a folder under another user's client", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "folder-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "folder-attacker@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: owner.user.userId,
      });

      const response = await attacker.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({ name: "Hijacked" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: attacker.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(foldersTable);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects an invalid payload and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-folder@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({ name: "" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(foldersTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a name longer than the schema's max length and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "oversized-folder@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const oversizedName = "a".repeat(256);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({ name: oversizedName }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(foldersTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects creating a folder under a parentId that does not exist and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "missing-parent@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        {
          body: JSON.stringify({ name: "Orphan", parentId: 999999 }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "POST",
        },
      );
      const rows = await db.select().from(foldersTable);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("GET /clients/:clientId/folders", () => {
  test("lists only root folders by default, scoped to the client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "list-folders@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "2026",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, folderListSchema);

      expect(body.folders.map((folder) => folder.name)).toEqual(["Contracts"]);
    });
  });

  test("lists subfolders when parentId is provided", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "list-subfolders@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "2026",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?parentId=${root.folderId}`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, folderListSchema);

      expect(body.folders.map((folder) => folder.name)).toEqual(["2026"]);
    });
  });

  test("paginates root folders", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "paginate-folders@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      for (let index = 0; index < 13; index += 1) {
        await context.repositories.folder.create({
          clientId: client.clientId,
          name: `Folder ${index}`,
          parentId: null,
          userId: authenticated.user.userId,
        });
      }

      const firstPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?page=1`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const firstPage = await parseJson(firstPageResponse, folderListSchema);

      expect(firstPage.folders).toHaveLength(12);
      expect(firstPage.meta).toEqual({ lastPage: 2, page: 1 });

      const secondPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?page=2`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const secondPage = await parseJson(secondPageResponse, folderListSchema);

      expect(secondPage.folders).toHaveLength(1);
      expect(secondPage.meta).toEqual({ lastPage: 2, page: 2 });
    });
  });

  test("filters folders by name via the search query param", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "search-folders@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Findable Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Invoices",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?search=Findable`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, folderListSchema);

      expect(body.folders.map((folder) => folder.name)).toEqual([
        "Findable Contracts",
      ]);
    });
  });

  test("rejects a non-positive or non-numeric page parameter with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-folder-page@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const zeroPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?page=0`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const nonNumericPageResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders?page=not-a-number`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(zeroPageResponse.status).toBe(400);
      expect(nonNumericPageResponse.status).toBe(400);
    });
  });

  test("rejects listing with a parentId that belongs to a different client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "cross-client-list@example.com",
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
      const folderUnderA = await context.repositories.folder.create({
        clientId: clientA.clientId,
        name: "A Folder",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${clientB.clientId}/folders?parentId=${folderUnderA.folderId}`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("PATCH /clients/:clientId/folders/:folderId", () => {
  test("renames only the caller's own folder and rejects another user's", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "rename-owner@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "rename-other@example.com",
      });
      const ownClient = await context.repositories.client.create({
        email: "own@example.com",
        name: "Own Client",
        userId: owner.user.userId,
      });
      const ownFolder = await context.repositories.folder.create({
        clientId: ownClient.clientId,
        name: "Before",
        parentId: null,
        userId: owner.user.userId,
      });
      const foreignClient = await context.repositories.client.create({
        email: "foreign@example.com",
        name: "Foreign Client",
        userId: other.user.userId,
      });
      const foreignFolder = await context.repositories.folder.create({
        clientId: foreignClient.clientId,
        name: "Foreign Before",
        parentId: null,
        userId: other.user.userId,
      });

      const response = await owner.app.request(
        `/api/clients/${ownClient.clientId}/folders/${ownFolder.folderId}`,
        {
          body: JSON.stringify({ name: "After" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: owner.cookie,
          },
          method: "PATCH",
        },
      );
      const body = await parseJson(response, folderSchema);

      expect(response.status).toBe(200);
      expect(body.name).toBe("After");

      const foreignResponse = await owner.app.request(
        `/api/clients/${foreignClient.clientId}/folders/${foreignFolder.folderId}`,
        {
          body: JSON.stringify({ name: "Hijacked" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: owner.cookie,
          },
          method: "PATCH",
        },
      );
      const foreignRow = await db
        .select()
        .from(foldersTable)
        .where(eq(foldersTable.folderId, foreignFolder.folderId));

      expect(foreignResponse.status).toBe(404);
      expect(foreignRow[0]).toMatchObject({ name: "Foreign Before" });
    });
  });

  test("rejects an invalid payload (empty or oversized name) and leaves the folder unchanged", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-update-folder@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Original",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const emptyResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${folder.folderId}`,
        {
          body: JSON.stringify({ name: "" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const oversizedResponse = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${folder.folderId}`,
        {
          body: JSON.stringify({ name: "a".repeat(256) }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const row = await db
        .select()
        .from(foldersTable)
        .where(eq(foldersTable.folderId, folder.folderId));

      expect(emptyResponse.status).toBe(400);
      expect(oversizedResponse.status).toBe(400);
      expect(row[0]).toMatchObject({ name: "Original" });
    });
  });

  test("rejects a non-numeric folderId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-folder-id-patch@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Original",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(foldersTable);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/not-a-number`,
        {
          body: JSON.stringify({ name: "Hijacked" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const after = await db.select().from(foldersTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

describe("GET /clients/:clientId/folders/:folderId/path", () => {
  test("returns the full ancestor chain from root to the given folder", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "folder-path@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const child = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "2026",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });
      const grandchild = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Q1",
        parentId: child.folderId,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${grandchild.folderId}/path`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(
        response,
        z.object({ path: z.array(folderSchema) }),
      );

      expect(body.path.map((folder) => folder.name)).toEqual([
        "Contracts",
        "2026",
        "Q1",
      ]);
    });
  });

  test("rejects a folder belonging to another user", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "path-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "path-attacker@example.com",
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
        `/api/clients/${client.clientId}/folders/${folder.folderId}/path`,
        { headers: { Cookie: attacker.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });

  test("returns a single-item path for a root folder", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "root-path@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${root.folderId}/path`,
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(
        response,
        z.object({ path: z.array(folderSchema) }),
      );

      expect(body.path.map((folder) => folder.name)).toEqual(["Contracts"]);
    });
  });

  test("returns 404 for a folderId that does not exist", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "missing-path@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/999999/path`,
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("DELETE /clients/:clientId/folders/:folderId", () => {
  test("removing a folder cascades to its subfolders", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "delete-folder@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const root = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Contracts",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const child = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "2026",
        parentId: root.folderId,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${root.folderId}`,
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const rows = await db
        .select()
        .from(foldersTable)
        .where(eq(foldersTable.folderId, child.folderId));

      expect(response.status).toBe(204);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects deleting another user's folder", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "delete-owner@example.com",
      });
      const attacker = await createAuthenticatedApp({
        context,
        email: "delete-attacker@example.com",
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
        `/api/clients/${client.clientId}/folders/${folder.folderId}`,
        { headers: { Cookie: attacker.cookie }, method: "DELETE" },
      );
      const rows = await db
        .select()
        .from(foldersTable)
        .where(eq(foldersTable.folderId, folder.folderId));

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(1);
    });
  });

  test("rejects a non-numeric folderId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-folder-id-delete@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Original",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(foldersTable);

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/not-a-number`,
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const after = await db.select().from(foldersTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });

  test("removing a folder does not affect sibling folders or other clients' folders", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "delete-scope@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const otherClient = await context.repositories.client.create({
        email: "other@example.com",
        name: "Other Client",
        userId: authenticated.user.userId,
      });
      const target = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Target",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const sibling = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Sibling",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const otherClientFolder = await context.repositories.folder.create({
        clientId: otherClient.clientId,
        name: "Unrelated",
        parentId: null,
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}/folders/${target.folderId}`,
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const remainingRows = await db.select().from(foldersTable);

      expect(response.status).toBe(204);
      expect(remainingRows.map((row) => row.folderId).sort()).toEqual(
        [sibling.folderId, otherClientFolder.folderId].sort(),
      );
    });
  });
});

describe("Authentication", () => {
  test("all folder endpoints reject missing authentication without changing folder data", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "unauthenticated-folders@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const folder = await context.repositories.folder.create({
        clientId: client.clientId,
        name: "Existing",
        parentId: null,
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(foldersTable);

      const requests = [
        new Request(`http://localhost/api/clients/${client.clientId}/folders`),
        new Request(`http://localhost/api/clients/${client.clientId}/folders`, {
          body: JSON.stringify({ name: "New" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
        new Request(
          `http://localhost/api/clients/${client.clientId}/folders/${folder.folderId}`,
          {
            body: JSON.stringify({ name: "New" }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
        ),
        new Request(
          `http://localhost/api/clients/${client.clientId}/folders/${folder.folderId}`,
          { method: "DELETE" },
        ),
        new Request(
          `http://localhost/api/clients/${client.clientId}/folders/${folder.folderId}/path`,
        ),
      ];

      const responses = await Promise.all(
        requests.map(async (request) => await authenticated.app.fetch(request)),
      );
      const after = await db.select().from(foldersTable);

      expect(responses.map((response) => response.status)).toEqual([
        401, 401, 401, 401, 401,
      ]);
      expect(after).toEqual(before);
    });
  });
});
