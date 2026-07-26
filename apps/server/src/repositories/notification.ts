import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { NotificationType } from "@repo/constants/notifications";
import { BaseRepository } from "@server/lib/base-repository";
import { notificationsTable } from "@server/infrastructure/database/schemas";

export class NotificationRepository extends BaseRepository {
  public async create(input: {
    body: string;
    data: Record<string, unknown>;
    title: string;
    type: NotificationType;
    userId: string;
  }) {
    const notifications = await this.db
      .insert(notificationsTable)
      .values(input)
      .returning();

    return notifications.at(0)!;
  }

  public async list(input: { cursor?: number; limit: number; userId: string }) {
    const where = input.cursor
      ? and(
          eq(notificationsTable.userId, input.userId),
          lt(notificationsTable.notificationId, input.cursor),
        )
      : eq(notificationsTable.userId, input.userId);
    const notifications = await this.db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.notificationId))
      .limit(input.limit + 1);
    const hasNextPage = notifications.length > input.limit;
    const items = hasNextPage
      ? notifications.slice(0, input.limit)
      : notifications;

    return {
      notifications: items,
      nextCursor: hasNextPage ? (items.at(-1)?.notificationId ?? null) : null,
    };
  }

  public async getUnreadCount(where: { userId: string }): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, where.userId),
          isNull(notificationsTable.readAt),
        ),
      );

    return rows.at(0)?.count ?? 0;
  }

  public async markAllRead(where: { userId: string }): Promise<void> {
    await this.db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, where.userId),
          isNull(notificationsTable.readAt),
        ),
      );
  }

  public async markRead(where: {
    notificationId: number;
    userId: string;
  }): Promise<boolean> {
    const notifications = await this.db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.notificationId, where.notificationId),
          eq(notificationsTable.userId, where.userId),
          isNull(notificationsTable.readAt),
        ),
      )
      .returning({ notificationId: notificationsTable.notificationId });

    return notifications.length > 0;
  }
}
