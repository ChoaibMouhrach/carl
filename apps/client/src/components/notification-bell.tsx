import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

interface Notification {
  body: string;
  createdAt: string | Date;
  data: unknown;
  notificationId: number;
  readAt: string | Date | null;
  title: string;
}

interface NotificationListResult {
  notifications: Notification[];
}

interface UnreadCountResult {
  unreadCount: number;
}

const relativeTime = (createdAt: string | Date): string => {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 1_000),
  );

  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;

  return `${Math.floor(seconds / 86_400)}d ago`;
};

const getLink = (data: unknown): string | null => {
  if (!data || typeof data !== "object" || !("link" in data)) return null;

  const { link } = data;
  if (typeof link !== "string" || !link.startsWith("/")) return null;

  return link.startsWith("/app/") ? link.slice(4) : link;
};

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const listKey = ["notifications", "list"] as const;
  const unreadKey = ["notifications", "unread-count"] as const;

  const unreadCount = useQuery({
    queryKey: unreadKey,
    queryFn: () => api.notification.unreadCount(),
    refetchInterval: 30_000,
  });
  const notifications = useQuery({
    enabled: open,
    queryKey: listKey,
    queryFn: () => api.notification.list(),
  });
  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (notificationId: number) =>
      api.notification.markRead(notificationId),
    onError,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previousList =
        queryClient.getQueryData<NotificationListResult>(listKey);
      const previousUnread =
        queryClient.getQueryData<UnreadCountResult>(unreadKey);

      if (previousList) {
        queryClient.setQueryData<NotificationListResult>(listKey, {
          notifications: previousList.notifications.map((notification) =>
            notification.notificationId === notificationId &&
            notification.readAt === null
              ? { ...notification, readAt: new Date().toISOString() }
              : notification,
          ),
        });
      }

      if (previousUnread && previousUnread.unreadCount > 0) {
        const wasUnread =
          previousList?.notifications.find(
            (notification) => notification.notificationId === notificationId,
          )?.readAt === null;

        if (wasUnread) {
          queryClient.setQueryData<UnreadCountResult>(unreadKey, {
            unreadCount: previousUnread.unreadCount - 1,
          });
        }
      }

      return { previousList, previousUnread };
    },
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notification.markAllRead(),
    onError,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previousList =
        queryClient.getQueryData<NotificationListResult>(listKey);

      if (previousList) {
        const readAt = new Date().toISOString();
        queryClient.setQueryData<NotificationListResult>(listKey, {
          notifications: previousList.notifications.map((notification) => ({
            ...notification,
            readAt: notification.readAt ?? readAt,
          })),
        });
      }

      queryClient.setQueryData<UnreadCountResult>(unreadKey, {
        unreadCount: 0,
      });

      return { previousList };
    },
    onSettled: invalidate,
  });

  const handleNotification = (notification: {
    data: unknown;
    notificationId: number;
    readAt: string | Date | null;
  }) => {
    if (notification.readAt === null) {
      markRead.mutate(notification.notificationId);
    }

    const link = getLink(notification.data);

    if (link) {
      setOpen(false);
      void navigate({ to: link });
    }
  };

  const count = unreadCount.data?.unreadCount ?? 0;

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open notifications"
          className="relative"
          size="icon"
          variant="outline"
        >
          <Bell />
          {count > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px]">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {count > 0 && (
            <Button
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              size="sm"
              variant="ghost"
            >
              {markAllRead.isPending ? <Spinner /> : <Check />}
              Mark all as read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.isPending && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {notifications.data?.notifications.length === 0 && (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            You&apos;re all caught up.
          </p>
        )}
        {notifications.data?.notifications.map((notification) => (
          <DropdownMenuItem
            className="items-start gap-3 p-3"
            key={notification.notificationId}
            onSelect={() => handleNotification(notification)}
          >
            <span
              aria-hidden="true"
              className={
                notification.readAt
                  ? "mt-1.5 size-2 shrink-0"
                  : "bg-primary mt-1.5 size-2 shrink-0 rounded-full"
              }
            />
            <span className="min-w-0 space-y-1">
              <span className="block font-medium">{notification.title}</span>
              <span className="text-muted-foreground block">
                {notification.body}
              </span>
              <span className="text-muted-foreground block text-xs">
                {relativeTime(notification.createdAt)}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
