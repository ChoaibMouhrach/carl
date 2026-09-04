import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { clientsTable } from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const clientSchema = z.object({
  clientId: z.number().int().positive(),
  createdAt: z.coerce.date(),
  email: z.email(),
  name: z.string().min(1),
  updatedAt: z.coerce.date(),
  userId: z.string().min(1),
});

const clientListSchema = z.object({
  clients: z.array(clientSchema),
  meta: z.object({
    lastPage: z.number().int().positive(),
    page: z.number().int().positive(),
  }),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

describe("POST /clients", () => {
  test("creates a client scoped to the caller and persists the exact fields", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "creator@example.com",
      });

      const response = await authenticated.app.request("/api/clients", {
        body: JSON.stringify({ email: "acme@example.com", name: "Acme Corp" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const body = await parseJson(response, clientSchema);

      expect(response.status).toBe(201);
      expect(body).toMatchObject({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const rows = await db.select().from(clientsTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        clientId: body.clientId,
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
    });
  });

  test("ignores a client-supplied userId in the body and always scopes the created client to the authenticated caller", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const attacker = await createAuthenticatedApp({
        context,
        email: "attacker@example.com",
      });
      const target = await createAuthenticatedApp({
        context,
        email: "target@example.com",
      });

      const response = await attacker.app.request("/api/clients", {
        body: JSON.stringify({
          email: "spoofed@example.com",
          name: "Spoofed Client",
          userId: target.user.userId,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: attacker.cookie,
        },
        method: "POST",
      });
      const body = await parseJson(response, clientSchema);

      expect(response.status).toBe(201);
      expect(body.userId).toBe(attacker.user.userId);

      const rows = await db.select().from(clientsTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(attacker.user.userId);

      const targetsClients = rows.filter(
        (row) => row.userId === target.user.userId,
      );
      expect(targetsClients).toHaveLength(0);
    });
  });

  test("rejects an invalid payload and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-create@example.com",
      });

      const response = await authenticated.app.request("/api/clients", {
        body: JSON.stringify({ email: "not-an-email", name: "" }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(clientsTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });

  test("rejects a name or email longer than the schema's max length and writes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "oversized-create@example.com",
      });
      const oversizedName = "a".repeat(256);

      const response = await authenticated.app.request("/api/clients", {
        body: JSON.stringify({
          email: "valid@example.com",
          name: oversizedName,
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: authenticated.cookie,
        },
        method: "POST",
      });
      const rows = await db.select().from(clientsTable);

      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("GET /clients", () => {
  test("scopes results to the caller, applies search, and paginates", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "owner@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "other@example.com",
      });

      for (let index = 0; index < 13; index += 1) {
        await context.repositories.client.create({
          email: `owner-${index}@example.com`,
          name: `Owner Client ${index}`,
          userId: owner.user.userId,
        });
      }
      await context.repositories.client.create({
        email: "searchable@example.com",
        name: "Findable Widgets",
        userId: owner.user.userId,
      });
      await context.repositories.client.create({
        email: "foreign@example.com",
        name: "Foreign Client",
        userId: other.user.userId,
      });

      const firstPageResponse = await owner.app.request("/api/clients?page=1", {
        headers: { Cookie: owner.cookie },
      });
      const firstPage = await parseJson(firstPageResponse, clientListSchema);

      // 14 clients belong to owner (13 + the searchable one); default page size is 12.
      expect(firstPage.clients).toHaveLength(12);
      expect(firstPage.meta).toEqual({ lastPage: 2, page: 1 });
      expect(
        firstPage.clients.every(
          (client) => client.userId === owner.user.userId,
        ),
      ).toBe(true);

      const secondPageResponse = await owner.app.request(
        "/api/clients?page=2",
        { headers: { Cookie: owner.cookie } },
      );
      const secondPage = await parseJson(secondPageResponse, clientListSchema);

      expect(secondPage.clients).toHaveLength(2);
      expect(secondPage.meta).toEqual({ lastPage: 2, page: 2 });

      const searchResponse = await owner.app.request(
        "/api/clients?search=Findable",
        { headers: { Cookie: owner.cookie } },
      );
      const searchResult = await parseJson(searchResponse, clientListSchema);

      expect(searchResult.clients.map((client) => client.name)).toEqual([
        "Findable Widgets",
      ]);
      expect(searchResult.meta).toEqual({ lastPage: 1, page: 1 });
    });
  });

  test("returns an empty list with lastPage 1 for a caller who has no clients", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "no-clients@example.com",
      });

      const response = await authenticated.app.request("/api/clients", {
        headers: { Cookie: authenticated.cookie },
      });
      const body = await parseJson(response, clientListSchema);

      expect(body.clients).toEqual([]);
      expect(body.meta).toEqual({ lastPage: 1, page: 1 });
    });
  });

  test("returns an empty list when the search term matches no client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "no-match@example.com",
      });
      await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        "/api/clients?search=NoSuchClient",
        { headers: { Cookie: authenticated.cookie } },
      );
      const body = await parseJson(response, clientListSchema);

      expect(body.clients).toEqual([]);
      expect(body.meta).toEqual({ lastPage: 1, page: 1 });
    });
  });

  test("returns an empty list when requesting a page past the last page", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "past-last-page@example.com",
      });
      await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request("/api/clients?page=5", {
        headers: { Cookie: authenticated.cookie },
      });
      const body = await parseJson(response, clientListSchema);

      expect(body.clients).toEqual([]);
      expect(body.meta).toEqual({ lastPage: 1, page: 5 });
    });
  });

  test("rejects a non-positive or non-numeric page parameter with 400", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-page@example.com",
      });

      const zeroPageResponse = await authenticated.app.request(
        "/api/clients?page=0",
        { headers: { Cookie: authenticated.cookie } },
      );
      const nonNumericPageResponse = await authenticated.app.request(
        "/api/clients?page=not-a-number",
        { headers: { Cookie: authenticated.cookie } },
      );

      expect(zeroPageResponse.status).toBe(400);
      expect(nonNumericPageResponse.status).toBe(400);
    });
  });
});

describe("PATCH /clients/:clientId", () => {
  test("updates only the caller's own client and rejects updating another user's client", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "editor@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "bystander@example.com",
      });
      const ownClient = await context.repositories.client.create({
        email: "before@example.com",
        name: "Before Name",
        userId: owner.user.userId,
      });
      const foreignClient = await context.repositories.client.create({
        email: "foreign-before@example.com",
        name: "Foreign Before",
        userId: other.user.userId,
      });

      const updateResponse = await owner.app.request(
        `/api/clients/${ownClient.clientId}`,
        {
          body: JSON.stringify({
            email: "after@example.com",
            name: "After Name",
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: owner.cookie,
          },
          method: "PATCH",
        },
      );
      const updateBody = await parseJson(updateResponse, clientSchema);

      expect(updateResponse.status).toBe(200);
      expect(updateBody).toMatchObject({
        email: "after@example.com",
        name: "After Name",
      });

      const ownRow = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.clientId, ownClient.clientId));
      expect(ownRow[0]).toMatchObject({
        email: "after@example.com",
        name: "After Name",
      });

      const foreignUpdateResponse = await owner.app.request(
        `/api/clients/${foreignClient.clientId}`,
        {
          body: JSON.stringify({
            email: "hijacked@example.com",
            name: "Hijacked",
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: owner.cookie,
          },
          method: "PATCH",
        },
      );
      const foreignRowAfter = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.clientId, foreignClient.clientId));

      expect(foreignUpdateResponse.status).toBe(404);
      expect(foreignRowAfter[0]).toMatchObject({
        email: "foreign-before@example.com",
        name: "Foreign Before",
      });
    });
  });

  test("rejects an invalid payload (missing name or email) and leaves the client unchanged", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-update@example.com",
      });
      const client = await context.repositories.client.create({
        email: "original@example.com",
        name: "Original Name",
        userId: authenticated.user.userId,
      });

      const response = await authenticated.app.request(
        `/api/clients/${client.clientId}`,
        {
          body: JSON.stringify({ name: "Missing Email" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const row = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.clientId, client.clientId));

      expect(response.status).toBe(400);
      expect(row[0]).toMatchObject({
        email: "original@example.com",
        name: "Original Name",
      });
    });
  });

  test("rejects a non-numeric clientId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-update-id@example.com",
      });
      await context.repositories.client.create({
        email: "original@example.com",
        name: "Original Name",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(clientsTable);

      const response = await authenticated.app.request(
        "/api/clients/not-a-number",
        {
          body: JSON.stringify({
            email: "hijacked@example.com",
            name: "Hijacked",
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: authenticated.cookie,
          },
          method: "PATCH",
        },
      );
      const after = await db.select().from(clientsTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

describe("DELETE /clients/:clientId", () => {
  test("removes only the caller's own client, rejects deleting another user's, and is not idempotent past the first call", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "remover@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "protected@example.com",
      });
      const ownClient = await context.repositories.client.create({
        email: "own@example.com",
        name: "Own Client",
        userId: owner.user.userId,
      });
      const foreignClient = await context.repositories.client.create({
        email: "foreign@example.com",
        name: "Foreign Client",
        userId: other.user.userId,
      });

      const foreignDeleteResponse = await owner.app.request(
        `/api/clients/${foreignClient.clientId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const foreignRowAfterAttempt = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.clientId, foreignClient.clientId));

      expect(foreignDeleteResponse.status).toBe(404);
      expect(foreignRowAfterAttempt).toHaveLength(1);

      const deleteResponse = await owner.app.request(
        `/api/clients/${ownClient.clientId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );
      const ownRowAfter = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.clientId, ownClient.clientId));

      expect(deleteResponse.status).toBe(204);
      expect(ownRowAfter).toHaveLength(0);

      const secondDeleteResponse = await owner.app.request(
        `/api/clients/${ownClient.clientId}`,
        { headers: { Cookie: owner.cookie }, method: "DELETE" },
      );

      expect(secondDeleteResponse.status).toBe(404);
    });
  });

  test("rejects a non-numeric clientId param with 400 and changes nothing", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "invalid-delete-id@example.com",
      });
      await context.repositories.client.create({
        email: "original@example.com",
        name: "Original Name",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(clientsTable);

      const response = await authenticated.app.request(
        "/api/clients/not-a-number",
        { headers: { Cookie: authenticated.cookie }, method: "DELETE" },
      );
      const after = await db.select().from(clientsTable);

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

describe("Authentication", () => {
  test("all client endpoints reject missing authentication without changing client data", async () => {
    await withTestDatabase(async ({ context, db }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "unauthenticated-clients@example.com",
      });
      const client = await context.repositories.client.create({
        email: "existing@example.com",
        name: "Existing Client",
        userId: authenticated.user.userId,
      });
      const before = await db.select().from(clientsTable);

      const requests = [
        new Request("http://localhost/api/clients"),
        new Request("http://localhost/api/clients", {
          body: JSON.stringify({ email: "new@example.com", name: "New" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
        new Request(`http://localhost/api/clients/${client.clientId}`, {
          body: JSON.stringify({ email: "new@example.com", name: "New" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }),
        new Request(`http://localhost/api/clients/${client.clientId}`, {
          method: "DELETE",
        }),
      ];

      const responses = await Promise.all(
        requests.map(async (request) => await authenticated.app.fetch(request)),
      );
      const after = await db.select().from(clientsTable);

      expect(responses.map((response) => response.status)).toEqual([
        401, 401, 401, 401,
      ]);
      expect(after).toEqual(before);
    });
  });
});
