import { api } from "@/api";
import { CopyButton } from "@/components/copy-button";
import { ExternalLink } from "@/components/external-link";
import { PictureAvatar } from "@/components/picture-avatar";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
import { formatDate, formatNumber } from "@/lib/format";
import { invalidateLeadData } from "@/lib/invalidate";
import { socialFields, socialLabels } from "@/lib/lead";
import { Button } from "@repo/ui/components/ui/button";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2Icon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DeleteButton } from "./delete-button";
import { SheetField } from "./sheet-field";
import { useEntitySheet } from "./use-entity-sheet";

interface LeadSheetProps {
  leadId?: number;
  onClose: () => void;
}

export const LeadSheet = ({ leadId, onClose }: LeadSheetProps) => {
  const queryClient = useQueryClient();
  const { openCommunity } = useEntitySheet();

  const lead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId: leadId ?? 0 }),
    enabled: leadId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.lead.remove({ leadId: id }),
    onError,
    onSuccess: async () => {
      toast.success("Lead deleted.");
      onClose();
      await invalidateLeadData(queryClient);
    },
  });

  const data = leadId === undefined ? undefined : lead.data;
  const links = data
    ? socialFields.flatMap((field) => {
        const url = data[field];
        return url ? [{ field, url }] : [];
      })
    : [];

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={leadId !== undefined}
    >
      <SheetContent size="split">
        {data ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4 pr-8">
                <PictureAvatar
                  className="size-14"
                  name={data.name}
                  src={data.pictureUrl}
                />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-lg">
                    {data.name}
                  </SheetTitle>
                  <SheetDescription>@{data.username}</SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Tip
                  label="Change this lead's details"
                  render={
                    <Button
                      render={
                        <Link
                          onClick={onClose}
                          params={{ leadId: data.leadId }}
                          to="/admin/leads/$leadId/edit"
                        />
                      }
                    />
                  }
                >
                  <PencilIcon />
                  Edit
                </Tip>
                <Tip
                  label="Open their Skool profile in a new tab"
                  render={
                    <Button
                      render={
                        <a
                          href={data.skoolUrl}
                          rel="noreferrer"
                          target="_blank"
                        />
                      }
                      variant="outline"
                    />
                  }
                >
                  <ExternalLinkIcon />
                  View on Skool
                </Tip>
                <DeleteButton
                  description={`This permanently deletes ${data.name}${
                    data.communities.length === 0
                      ? ""
                      : ` and ${data.communities.length === 1 ? "their community" : `their ${data.communities.length} communities`}`
                  }. This action cannot be undone.`}
                  isPending={remove.isPending}
                  onConfirm={() => remove.mutate(data.leadId)}
                  title="Delete this lead?"
                  tooltip="Delete this lead and their communities"
                />
              </div>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-8 px-4 pb-6">
                <dl className="grid gap-5">
                  <SheetField label="Email">
                    {data.email ? (
                      <span className="flex items-center gap-2">
                        <a
                          className="min-w-0 break-all hover:underline"
                          href={`mailto:${data.email}`}
                        >
                          {data.email}
                        </a>
                        <CopyButton
                          label="Copy email address"
                          value={data.email}
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No email yet
                      </span>
                    )}
                  </SheetField>
                  <SheetField label="Links">
                    {links.length === 0 ? (
                      <span className="text-muted-foreground">
                        No links yet
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {links.map(({ field, url }) => (
                          <li className="flex items-baseline gap-2" key={field}>
                            <span className="w-20 shrink-0 text-muted-foreground">
                              {socialLabels[field]}
                            </span>
                            <ExternalLink href={url} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </SheetField>
                  <SheetField label="Bio">
                    <span className="whitespace-pre-wrap wrap-anywhere">
                      {data.bio ?? (
                        <span className="text-muted-foreground">
                          No bio yet
                        </span>
                      )}
                    </span>
                  </SheetField>
                  <SheetField label="Added">
                    {formatDate(data.createdAt)}
                  </SheetField>
                </dl>
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">
                      {data.communities.length === 1
                        ? "1 community"
                        : `${data.communities.length} communities`}
                    </h3>
                    <Tip
                      label="Add a community owned by this lead"
                      render={
                        <Button
                          onClick={onClose}
                          render={
                            <Link
                              search={{ leadId: data.leadId }}
                              to="/admin/communities/new"
                            />
                          }
                          size="sm"
                          variant="outline"
                        />
                      }
                    >
                      <PlusIcon />
                      Add community
                    </Tip>
                  </div>
                  {data.communities.length === 0 ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Building2Icon className="size-4" />
                      Communities this lead owns will show up here.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {data.communities.map((community) => (
                        <li key={community.communityId}>
                          <button
                            className="flex w-full cursor-pointer items-center gap-3 p-3 text-left hover:bg-muted"
                            onClick={() => openCommunity(community.communityId)}
                            type="button"
                          >
                            <PictureAvatar
                              name={community.name}
                              src={community.logoUrl ?? community.thumbnailUrl}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {community.name}
                              </span>
                              <span className="block text-muted-foreground">
                                {community.members === null
                                  ? "—"
                                  : `${formatNumber(community.members)} members`}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="sr-only">Lead</SheetTitle>
              <SheetDescription className="sr-only">
                Loading lead
              </SheetDescription>
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-5 px-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="space-y-2" key={index}>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
