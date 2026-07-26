import { expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { notificationsTable } from "@server/infrastructure/database/schemas";
import type { Context } from "@server/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type PersistedNotification = typeof notificationsTable.$inferSelect;

const notificationSchema = z.object({
  body: z.string(),
  createdAt: z.coerce.date(),
  data: z.unknown(),
  notificationId: z.number().int().positive(),
  readAt: z.coerce.date().nullable(),
  title: z.string(),
  type: z.string(),
  updatedAt: z.coerce.date(),
  userId: z.string().min(1),
});

const notificationListSchema = z.object({
  nextCursor: z.number().int().positive().nullable(),
  notifications: z.array(notificationSchema),
});

const unreadCountSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

const seedNotification = async (input: {
  body: string;
  context: Context;
  title: string;
  type: "billing.renewed" | "job.completed";
  userId: string;
}) =>
  await input.context.repositories.notification.create({
    body: input.body,
    data: {},
    title: input.title,
    type: input.type,
    userId: input.userId,
  });

test("GET /notifications returns only the caller's newest notifications and supports a stable cursor", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "second@example.com",
    });

    const firstNotifications: PersistedNotification[] = [];
    for (let index = 0; index < 21; index += 1) {
      firstNotifications.push(
        await seedNotification({
          body: `First body ${index}`,
          context,
          title: `First title ${index}`,
          type: "job.completed",
          userId: first.user.userId,
        }),
      );
    }
    await seedNotification({
      body: "Second body",
      context,
      title: "Second title",
      type: "job.completed",
      userId: second.user.userId,
    });

    const firstPageResponse = await first.app.request("/api/notifications", {
      headers: { Cookie: first.cookie },
    });
    const firstPage = await parseJson(
      firstPageResponse,
      notificationListSchema,
    );
    const persistedFirstNotifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, first.user.userId));
    const lastNotificationOnFirstPage = firstPage.notifications.at(-1);
    const oldestFirstNotification = firstNotifications.at(0);

    if (!lastNotificationOnFirstPage || !oldestFirstNotification) {
      throw new Error(
        "The pagination fixture did not create enough notifications.",
      );
    }

    expect(firstPage.notifications).toHaveLength(20);
    expect(
      firstPage.notifications.map((notification) => notification.userId),
    ).toEqual(Array.from({ length: 20 }, () => first.user.userId));
    expect(
      firstPage.notifications.map(
        (notification) => notification.notificationId,
      ),
    ).toEqual(
      persistedFirstNotifications
        .sort((left, right) => right.notificationId - left.notificationId)
        .slice(0, 20)
        .map((notification) => notification.notificationId),
    );
    expect(firstPage.nextCursor).toBe(
      lastNotificationOnFirstPage.notificationId,
    );

    const secondPageResponse = await first.app.request(
      `/api/notifications?cursor=${firstPage.nextCursor}`,
      { headers: { Cookie: first.cookie } },
    );
    const secondPage = await parseJson(
      secondPageResponse,
      notificationListSchema,
    );

    expect(secondPage.nextCursor).toBeNull();
    expect(
      secondPage.notifications.map(
        (notification) => notification.notificationId,
      ),
    ).toEqual([oldestFirstNotification.notificationId]);
  });
});

test("GET /notifications rejects invalid cursors without changing notification data", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const authenticated = await createAuthenticatedApp({
      context,
      email: "cursor@example.com",
    });
    await seedNotification({
      body: "Body",
      context,
      title: "Title",
      type: "job.completed",
      userId: authenticated.user.userId,
    });
    const before = await db.select().from(notificationsTable);

    const response = await authenticated.app.request(
      "/api/notifications?cursor=not-a-number",
      { headers: { Cookie: authenticated.cookie } },
    );
    const after = await db.select().from(notificationsTable);

    expect(response.status).toBe(400);
    expect(after).toEqual(before);
  });
});

test("GET /notifications/unread-count returns the database count for only the authenticated user", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "unread-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "unread-second@example.com",
    });
    const unread = await seedNotification({
      body: "Unread body",
      context,
      title: "Unread title",
      type: "job.completed",
      userId: first.user.userId,
    });
    const read = await seedNotification({
      body: "Read body",
      context,
      title: "Read title",
      type: "job.completed",
      userId: first.user.userId,
    });
    await context.repositories.notification.markRead({
      notificationId: read.notificationId,
      userId: first.user.userId,
    });
    await seedNotification({
      body: "Other body",
      context,
      title: "Other title",
      type: "job.completed",
      userId: second.user.userId,
    });

    const response = await first.app.request(
      "/api/notifications/unread-count",
      {
        headers: { Cookie: first.cookie },
      },
    );
    const payload = await parseJson(response, unreadCountSchema);
    const unreadRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, first.user.userId),
          isNull(notificationsTable.readAt),
        ),
      );

    expect(
      unreadRows.map((notification) => notification.notificationId),
    ).toEqual([unread.notificationId]);
    expect(payload.unreadCount).toBe(unreadRows.length);
  });
});

test("POST /notifications/:notificationId/read marks only the caller's unread notification and is idempotent", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "mark-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "mark-second@example.com",
    });
    const ownNotification = await seedNotification({
      body: "Own body",
      context,
      title: "Own title",
      type: "job.completed",
      userId: first.user.userId,
    });
    const foreignNotification = await seedNotification({
      body: "Foreign body",
      context,
      title: "Foreign title",
      type: "job.completed",
      userId: second.user.userId,
    });

    await first.app.request(
      `/api/notifications/${foreignNotification.notificationId}/read`,
      { headers: { Cookie: first.cookie }, method: "POST" },
    );
    const foreignAfterAttempt = await db
      .select()
      .from(notificationsTable)
      .where(
        eq(
          notificationsTable.notificationId,
          foreignNotification.notificationId,
        ),
      );

    expect(foreignAfterAttempt[0]?.readAt).toBeNull();

    await first.app.request(
      `/api/notifications/${ownNotification.notificationId}/read`,
      { headers: { Cookie: first.cookie }, method: "POST" },
    );
    const afterFirstRead = await db
      .select()
      .from(notificationsTable)
      .where(
        eq(notificationsTable.notificationId, ownNotification.notificationId),
      );
    const readAt = afterFirstRead[0]?.readAt;

    expect(readAt).toBeInstanceOf(Date);

    await first.app.request(
      `/api/notifications/${ownNotification.notificationId}/read`,
      { headers: { Cookie: first.cookie }, method: "POST" },
    );
    const afterSecondRead = await db
      .select()
      .from(notificationsTable)
      .where(
        eq(notificationsTable.notificationId, ownNotification.notificationId),
      );

    expect(afterSecondRead[0]?.readAt).toEqual(readAt);
  });
});

test("POST /notifications/:notificationId/read rejects malformed identifiers and leaves missing records untouched", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const authenticated = await createAuthenticatedApp({
      context,
      email: "invalid-read@example.com",
    });
    const notification = await seedNotification({
      body: "Body",
      context,
      title: "Title",
      type: "job.completed",
      userId: authenticated.user.userId,
    });
    const before = await db.select().from(notificationsTable);

    const invalidResponse = await authenticated.app.request(
      "/api/notifications/not-a-number/read",
      { headers: { Cookie: authenticated.cookie }, method: "POST" },
    );
    const missingResponse = await authenticated.app.request(
      "/api/notifications/999999/read",
      { headers: { Cookie: authenticated.cookie }, method: "POST" },
    );
    const after = await db.select().from(notificationsTable);

    expect(invalidResponse.status).toBe(400);
    expect(missingResponse.status).toBe(204);
    expect(after).toEqual(before);
    expect(after[0]?.notificationId).toBe(notification.notificationId);
  });
});

test("POST /notifications/read-all marks every unread notification for the caller and preserves other users' records", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "all-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "all-second@example.com",
    });
    const firstUnread = await seedNotification({
      body: "First unread",
      context,
      title: "First unread",
      type: "job.completed",
      userId: first.user.userId,
    });
    const firstAlreadyRead = await seedNotification({
      body: "First read",
      context,
      title: "First read",
      type: "job.completed",
      userId: first.user.userId,
    });
    const secondUnread = await seedNotification({
      body: "Second unread",
      context,
      title: "Second unread",
      type: "job.completed",
      userId: second.user.userId,
    });
    await context.repositories.notification.markRead({
      notificationId: firstAlreadyRead.notificationId,
      userId: first.user.userId,
    });
    const alreadyReadBefore = await db
      .select()
      .from(notificationsTable)
      .where(
        eq(notificationsTable.notificationId, firstAlreadyRead.notificationId),
      );

    await first.app.request("/api/notifications/read-all", {
      headers: { Cookie: first.cookie },
      method: "POST",
    });

    const after = await db.select().from(notificationsTable);
    const ownUnreadAfter = after.find(
      (notification) =>
        notification.notificationId === firstUnread.notificationId,
    );
    const alreadyReadAfter = after.find(
      (notification) =>
        notification.notificationId === firstAlreadyRead.notificationId,
    );
    const foreignAfter = after.find(
      (notification) =>
        notification.notificationId === secondUnread.notificationId,
    );

    expect(ownUnreadAfter?.readAt).toBeInstanceOf(Date);
    expect(alreadyReadAfter?.readAt).toEqual(alreadyReadBefore[0]?.readAt);
    expect(foreignAfter?.readAt).toBeNull();

    const afterFirstMarkAll = after;
    await first.app.request("/api/notifications/read-all", {
      headers: { Cookie: first.cookie },
      method: "POST",
    });
    const afterSecondMarkAll = await db.select().from(notificationsTable);

    expect(afterSecondMarkAll).toEqual(afterFirstMarkAll);
  });
});

test("all notification endpoints reject missing authentication without changing notification data", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const authenticated = await createAuthenticatedApp({
      context,
      email: "unauthenticated@example.com",
    });
    const notification = await seedNotification({
      body: "Body",
      context,
      title: "Title",
      type: "job.completed",
      userId: authenticated.user.userId,
    });
    const requests = [
      new Request("http://localhost/api/notifications"),
      new Request("http://localhost/api/notifications/unread-count"),
      new Request(
        `http://localhost/api/notifications/${notification.notificationId}/read`,
        {
          method: "POST",
        },
      ),
      new Request("http://localhost/api/notifications/read-all", {
        method: "POST",
      }),
    ];
    const before = await db.select().from(notificationsTable);

    const responses = await Promise.all(
      requests.map(async (request) => await authenticated.app.fetch(request)),
    );
    const after = await db.select().from(notificationsTable);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
    expect(after).toEqual(before);
  });
});
