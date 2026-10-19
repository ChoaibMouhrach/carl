import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  mcpRequestsTable,
  oauthApplicationTable,
  userTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { withTestDatabase } from "./helpers/http";
import { countRows, issueToken, rpc, setup } from "./helpers/mcp";

const create = {
  name: "create_lead",
  arguments: { skoolUsername: "attempt", name: "Attempt" },
};

test("disabling the client stops its calls at once and enabling it brings them back", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    expect((await rpc(admin.app, token, "tools/list")).status).toBe(200);

    await db.update(oauthApplicationTable).set({ disabled: true });
    const disabled = (await rpc(admin.app, token, "tools/list")).status;
    await db.update(oauthApplicationTable).set({ disabled: false });
    const enabled = (await rpc(admin.app, token, "tools/list")).status;

    expect([disabled, enabled]).toEqual([401, 200]);
  });
});

test("banning the admin stops the agent and lifting the ban restores it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    const where = eq(userTable.id, admin.user.userId);

    await db.update(userTable).set({ banned: true }).where(where);
    const banned = (await rpc(admin.app, token, "tools/list")).status;
    await db.update(userTable).set({ banned: false }).where(where);
    const lifted = (await rpc(admin.app, token, "tools/list")).status;

    expect([banned, lifted]).toEqual([403, 200]);
  });
});

test("demoting and promoting the admin follows the next call each time", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    const where = eq(userTable.id, admin.user.userId);
    const statuses: number[] = [];

    for (const role of ["user", "admin", "user", "admin"]) {
      await db.update(userTable).set({ role }).where(where);
      statuses.push((await rpc(admin.app, token, "tools/list")).status);
    }

    expect(statuses).toEqual([403, 200, 403, 200]);
  });
});

test("demoting one admin does not touch another admin's agent", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, context } = await setup(db, pool);
    const other = await createAdminClient(context, "second-admin@example.com");
    const otherToken = await issueToken(db, other.user.userId, "second");

    await db
      .update(userTable)
      .set({ role: "user" })
      .where(eq(userTable.id, admin.user.userId));

    expect((await rpc(admin.app, token, "tools/list")).status).toBe(403);
    expect((await rpc(admin.app, otherToken, "tools/list")).status).toBe(200);
  });
});

test("a refused agent, in every way it can be refused, writes nothing, logs nothing and announces nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, context } = await setup(db, pool);
    const where = eq(userTable.id, admin.user.userId);
    const before = await countRows(db);
    context.eventBus.published.length = 0;

    await db.update(userTable).set({ role: "user" }).where(where);
    const demoted = await rpc(admin.app, token, "tools/call", create);
    await db
      .update(userTable)
      .set({ role: "admin", banned: true })
      .where(where);
    const banned = await rpc(admin.app, token, "tools/call", create);
    await db.update(userTable).set({ banned: false }).where(where);
    await db.update(oauthApplicationTable).set({ disabled: true });
    const disabled = await rpc(admin.app, token, "tools/call", create);
    const unknown = await rpc(admin.app, "not-a-token", "tools/call", create);

    // Each refusal happens in the access check, before any tool or log write exists
    expect([
      demoted.status,
      banned.status,
      disabled.status,
      unknown.status,
    ]).toEqual([403, 403, 401, 401]);
    expect(await countRows(db)).toEqual(before);
    expect(await db.$count(mcpRequestsTable)).toBe(0);
    expect(context.eventBus.published).toEqual([]);
  });
});
