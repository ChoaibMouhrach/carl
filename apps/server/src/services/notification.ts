import type { NotificationType } from "@repo/constants/notifications";
import { renderNotification } from "@server/emails";
import { BaseService } from "@server/lib/base-service";

const notificationPageSize = 20;

export class NotificationService extends BaseService {
  public async send(input: {
    body: string;
    data?: Record<string, unknown>;
    title: string;
    type: NotificationType;
    userId: string;
  }): Promise<void> {
    const user = await this.context.repositories.user.findByUserId({
      userId: input.userId,
    });

    if (!user) return;

    const notification = await this.context.repositories.notification.create({
      body: input.body,
      data: input.data ?? {},
      title: input.title,
      type: input.type,
      userId: input.userId,
    });

    const emailHtml = await renderNotification({
      title: input.title,
      body: input.body,
      logoUrl: this.context.env.LOGO_URL,
    });

    await this.context.queueHub.email.add(
      {
        from: "notifications",
        html: emailHtml,
        subject: input.title,
        to: [user.email],
      },
      { idempotencyKey: `notification:${notification.notificationId}` },
    );
  }

  public async list(input: { cursor?: number; userId: string }) {
    return await this.context.repositories.notification.list({
      cursor: input.cursor,
      limit: notificationPageSize,
      userId: input.userId,
    });
  }

  public async markRead(input: {
    notificationId: number;
    userId: string;
  }): Promise<void> {
    await this.context.repositories.notification.markRead(input);
  }

  public async markAllRead(input: { userId: string }): Promise<void> {
    await this.context.repositories.notification.markAllRead(input);
  }

  public async getUnreadCount(input: { userId: string }) {
    const unreadCount =
      await this.context.repositories.notification.getUnreadCount(input);

    return { unreadCount };
  }
}
