import type { NotificationType } from "@repo/constants/notifications";
import { BaseService } from "@server/lib/base-service";

const notificationPageSize = 20;

const htmlEntities: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) => htmlEntities[character] ?? character,
  );

export class NotificationService extends BaseService {
  public async send(input: {
    body: string;
    data?: Record<string, unknown>;
    title: string;
    type: NotificationType;
    userId: number;
  }): Promise<void> {
    const user = await this.context.repositories.user.findByUserId({
      userId: input.userId,
    });

    if (!user) return;

    await this.context.repositories.notification.create({
      body: input.body,
      data: input.data ?? {},
      title: input.title,
      type: input.type,
      userId: input.userId,
    });

    await this.context.queueHub.email.add({
      from: "notifications",
      html: `<p>${escapeHtml(input.body)}</p>`,
      subject: input.title,
      to: [user.email],
    });
  }

  public async list(input: { cursor?: number; userId: number }) {
    return await this.context.repositories.notification.list({
      cursor: input.cursor,
      limit: notificationPageSize,
      userId: input.userId,
    });
  }

  public async markRead(input: {
    notificationId: number;
    userId: number;
  }): Promise<void> {
    await this.context.repositories.notification.markRead(input);
  }

  public async markAllRead(input: { userId: number }): Promise<void> {
    await this.context.repositories.notification.markAllRead(input);
  }

  public async getUnreadCount(input: { userId: number }) {
    const unreadCount =
      await this.context.repositories.notification.getUnreadCount(input);

    return { unreadCount };
  }
}
