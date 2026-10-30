import { expect, test } from "bun:test";
import {
  leadEmailsTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { withTestDatabase } from "./helpers/http";
import { leadEmailRows } from "./helpers/pipeline";

test("email inserts normalize and deduplicate addresses while retaining the first source and isolating leads", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await context.repositories.lead.create({
      name: "First",
      username: "first",
      skoolUrl: "https://www.skool.com/@first",
    });
    const second = await context.repositories.lead.create({
      name: "Second",
      username: "second",
      skoolUrl: "https://www.skool.com/@second",
    });

    await context.repositories.leadEmail.addMany({
      leadId: first.leadId,
      addresses: [" HELLO@Coach.com ", "hello@coach.com", "", "  "],
      source: "skool",
    });
    await Promise.all([
      context.repositories.leadEmail.addMany({
        leadId: first.leadId,
        addresses: ["hello@coach.com", "new@coach.com"],
        source: "website",
      }),
      context.repositories.leadEmail.addMany({
        leadId: first.leadId,
        addresses: ["hello@coach.com", "new@coach.com"],
        source: "website",
      }),
    ]);
    await context.repositories.leadEmail.addMany({
      leadId: second.leadId,
      addresses: ["hello@coach.com"],
      source: "manual",
    });

    expect(await leadEmailRows(db, first.leadId)).toEqual([
      { address: "hello@coach.com", source: "skool" },
      { address: "new@coach.com", source: "website" },
    ]);
    expect(await leadEmailRows(db, second.leadId)).toEqual([
      { address: "hello@coach.com", source: "manual" },
    ]);
  });
});

test("deleting a lead cascades its emails and preserves other leads' email rows", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "email-admin@example.com");
    const first = await context.repositories.lead.create({
      name: "First",
      username: "first",
      skoolUrl: "https://www.skool.com/@first",
    });
    const second = await context.repositories.lead.create({
      name: "Second",
      username: "second",
      skoolUrl: "https://www.skool.com/@second",
    });
    await context.repositories.leadEmail.addMany({
      leadId: first.leadId,
      addresses: ["one@coach.com", "two@coach.com"],
      source: "website",
    });
    await context.repositories.leadEmail.addMany({
      leadId: second.leadId,
      addresses: ["one@coach.com"],
      source: "manual",
    });
    const remaining = await leadEmailRows(db, second.leadId);

    const response = await admin.delete(`/api/leads/${first.leadId}`);

    expect(response.status).toBe(204);
    expect(await db.select().from(leadsTable)).toMatchObject([
      { leadId: second.leadId },
    ]);
    expect(await db.select().from(leadEmailsTable)).toMatchObject([
      { leadId: second.leadId },
    ]);
    expect(await leadEmailRows(db, first.leadId)).toEqual([]);
    expect(await leadEmailRows(db, second.leadId)).toEqual(remaining);
  });
});

test("a lead update rejects more than twenty emails without persisting field or email changes", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "email-admin@example.com");
    const lead = await context.repositories.lead.create({
      name: "Original",
      username: "original",
      skoolUrl: "https://www.skool.com/@original",
    });
    const before = await db.select().from(leadsTable);

    const response = await admin.patch(`/api/leads/${lead.leadId}`, {
      name: "Changed",
      emails: Array.from(
        { length: 21 },
        (_, index) => `email${index}@coach.com`,
      ),
    });

    expect(response.status).toBe(400);
    expect(await db.select().from(leadsTable)).toEqual(before);
    expect(await db.select().from(leadEmailsTable)).toEqual([]);
  });
});
