import { api } from "@/api";
import { CopyButton } from "@/components/copy-button";
import { CoverImage } from "@/components/cover-image";
import { PictureAvatar } from "@/components/picture-avatar";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
import {
  displayUrl,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/format";
import { invalidateLeadData } from "@/lib/invalidate";
import { CommunityPrice } from "@/pages/admin/communities/community-price";
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
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { useEntitySheet } from "./use-entity-sheet";
import { DeleteButton } from "./delete-button";
import { SheetField } from "./sheet-field";

interface CommunitySheetProps {
  communityId?: number;
  onClose: () => void;
}

export const CommunitySheet = ({
  communityId,
  onClose,
}: CommunitySheetProps) => {
  const queryClient = useQueryClient();
  const { openLead } = useEntitySheet();

  const community = useQuery({
    queryKey: ["admin", "communities", communityId],
    queryFn: () => api.community.show({ communityId: communityId ?? 0 }),
    enabled: communityId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.community.remove({ communityId: id }),
    onError,
    onSuccess: async () => {
      toast.success("Community deleted.");
      onClose();
      await invalidateLeadData(queryClient);
    },
  });

  const data = communityId === undefined ? undefined : community.data;
  const owner = data?.lead;

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={communityId !== undefined}
    >
      <SheetContent size="split">
        {data ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4 pr-8">
                <PictureAvatar
                  className="size-14"
                  name={data.name}
                  src={data.logoUrl ?? data.thumbnailUrl}
                />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-lg">
                    {data.name}
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {displayUrl(data.skoolUrl)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Tip
                  label="Change this community's details"
                  render={
                    <Button
                      render={
                        <Link
                          onClick={onClose}
                          params={{ communityId: data.communityId }}
                          to="/admin/communities/$communityId/edit"
                        />
                      }
                    />
                  }
                >
                  <PencilIcon />
                  Edit
                </Tip>
                <Tip
                  label="Open the community on Skool in a new tab"
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
                  description={`This permanently deletes ${data.name}. This action cannot be undone.`}
                  isPending={remove.isPending}
                  onConfirm={() => remove.mutate(data.communityId)}
                  title="Delete this community?"
                  tooltip="Delete this community"
                />
              </div>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 px-4 pb-6">
                {data.thumbnailUrl && <CoverImage src={data.thumbnailUrl} />}
                <dl className="grid grid-cols-3 gap-4">
                  <SheetField label="Members">
                    {data.members === null ? "—" : formatNumber(data.members)}
                  </SheetField>
                  <SheetField label="Monthly revenue">
                    {data.mrr === null ? "—" : formatCurrency(data.mrr, "USD")}
                  </SheetField>
                  <SheetField label="Price">
                    <CommunityPrice community={data} />
                  </SheetField>
                </dl>
                <dl className="grid gap-5">
                  <SheetField label="Owner">
                    {owner ? (
                      <button
                        className="flex cursor-pointer items-center gap-3 text-left hover:underline"
                        onClick={() => openLead(owner.leadId)}
                        type="button"
                      >
                        <PictureAvatar
                          name={owner.name}
                          src={owner.pictureUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {owner.name}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            @{owner.username}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span className="text-muted-foreground">No owner</span>
                    )}
                  </SheetField>
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
                  <SheetField label="About">
                    <span className="whitespace-pre-wrap wrap-anywhere">
                      {data.description ?? (
                        <span className="text-muted-foreground">
                          No description yet
                        </span>
                      )}
                    </span>
                  </SheetField>
                  <SheetField label="Added">
                    {formatDate(data.createdAt)}
                  </SheetField>
                </dl>
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="sr-only">Community</SheetTitle>
              <SheetDescription className="sr-only">
                Loading community
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
              <Skeleton className="h-40 w-full" />
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton className="h-10 w-full" key={index} />
                ))}
              </div>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
