import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { passkeyTable } from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const registerOptionsSchema = z.object({
  challenge: z.string().min(1),
  rp: z.object({ id: z.string(), name: z.string() }),
});

const passkeyListSchema = z.array(z.object({ id: z.string() }));

const passkeyValues = (input: {
  id: string;
  userId: string;
  name: string;
}) => ({
  id: input.id,
  name: input.name,
  userId: input.userId,
  publicKey: `public-key-${input.id}`,
  credentialID: `credential-${input.id}`,
  counter: 0,
  deviceType: "multiDevice",
  backedUp: true,
});

test("passkey registration requires a session and is bound to the client's domain", async () => {
  await withTestDatabase(async ({ context }) => {
    const member = await createAuthenticatedApp({
      context,
      email: "passkey-options@example.com",
    });

    const anonymous = await member.app.request(
      "/api/auth/passkey/generate-register-options",
    );
    expect(anonymous.status).toBe(401);

    const response = await member.app.request(
      "/api/auth/passkey/generate-register-options",
      { headers: { cookie: member.cookie } },
    );
    expect(response.status).toBe(200);

    const options = registerOptionsSchema.parse(await response.json());
    expect(options.rp.id).toBe(new URL(context.env.CLIENT_URL).hostname);
    expect(options.rp.name).toBe("Carl");
  });
});

test("users only see their own passkeys", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "passkey-list-one@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "passkey-list-two@example.com",
    });
    await db.insert(passkeyTable).values([
      passkeyValues({ id: "mine", userId: first.user.userId, name: "Mine" }),
      passkeyValues({
        id: "theirs",
        userId: second.user.userId,
        name: "Theirs",
      }),
    ]);

    const response = await first.app.request(
      "/api/auth/passkey/list-user-passkeys",
      {
        headers: { cookie: first.cookie },
      },
    );
    expect(response.status).toBe(200);

    const passkeys = passkeyListSchema.parse(await response.json());
    expect(passkeys.map((passkey) => passkey.id)).toEqual(["mine"]);
  });
});

test("users can delete their own passkey but not someone else's", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const owner = await createAuthenticatedApp({
      context,
      email: "passkey-owner@example.com",
    });
    const intruder = await createAuthenticatedApp({
      context,
      email: "passkey-intruder@example.com",
    });
    await db.insert(passkeyTable).values(
      passkeyValues({
        id: "owned",
        userId: owner.user.userId,
        name: "Owned",
      }),
    );

    const deletePasskey = (actor: typeof owner) =>
      actor.app.request("/api/auth/passkey/delete-passkey", {
        body: JSON.stringify({ id: "owned" }),
        headers: {
          "Content-Type": "application/json",
          cookie: actor.cookie,
          origin: context.env.CLIENT_URL,
        },
        method: "POST",
      });

    const rejected = await deletePasskey(intruder);
    expect(rejected.ok).toBe(false);
    expect(
      await db.select().from(passkeyTable).where(eq(passkeyTable.id, "owned")),
    ).toHaveLength(1);

    const deleted = await deletePasskey(owner);
    expect(deleted.status).toBe(200);
    expect(
      await db.select().from(passkeyTable).where(eq(passkeyTable.id, "owned")),
    ).toHaveLength(0);
  });
});
