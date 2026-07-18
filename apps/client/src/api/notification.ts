import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class NotificationApi extends BaseApi {
  public list(cursor?: number) {
    return this.call(() =>
      http.api.notifications.$get({
        query: { cursor: cursor?.toString() },
      }),
    );
  }

  public unreadCount() {
    return this.call(() => http.api.notifications["unread-count"].$get());
  }

  public markRead(notificationId: number) {
    return this.call(() =>
      http.api.notifications[":notificationId"].read.$post({
        param: { notificationId: String(notificationId) },
      }),
    );
  }

  public markAllRead() {
    return this.call(() => http.api.notifications["read-all"].$post());
  }
}
