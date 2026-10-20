import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { adminCampaignFilterRoute } from "@/routes/admin/campaign-filter";
import type { LeadOption } from "@/pages/admin/communities/lead-picker";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FilterForm } from "./filter-form";
import { FilterPreviewCard } from "./filter-preview";
import { PromptSheet } from "./prompt-sheet";

export const CampaignFilter = () => {
  const { campaignId } = adminCampaignFilterRoute.useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<LeadOption | null>(null);
  const [leadSearch, setLeadSearch] = useState("");

  const settings = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "filter"],
    queryFn: () => api.campaign.filter({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const leads = useQuery({
    queryKey: ["admin", "leads", "picker", leadSearch],
    queryFn: () => api.lead.list({ search: leadSearch || undefined }),
    placeholderData: (previousData) => previousData,
  });

  const save = useMutation({
    mutationFn: (values: Parameters<typeof api.campaign.saveFilter>[1]) =>
      api.campaign.saveFilter({ campaignId }, values),
    onError,
    onSuccess: async () => {
      toast.success("AI filter saved.");
      await invalidateCampaignData(queryClient);
    },
  });

  const prompt = useMutation({
    mutationFn: (values: Parameters<typeof api.campaign.saveFilter>[1]) =>
      api.campaign.promptFilter(
        { campaignId },
        { ...values, leadId: selected?.leadId },
      ),
    onError,
  });

  const preview = useMutation({
    mutationFn: (leadId: number) =>
      api.campaign.previewFilter({ campaignId, leadId }),
    onError,
  });

  if (settings.isPending) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index}>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (settings.isError) throw settings.error;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <FilterForm
        isPending={save.isPending}
        isPromptPending={prompt.isPending}
        onShowPrompt={(values) => prompt.mutate(values)}
        onSubmit={(values) => save.mutateAsync(values)}
        settings={settings.data}
      />
      <FilterPreviewCard
        isPending={preview.isPending}
        leads={leads.data?.leads ?? []}
        onChange={(lead) => {
          setSelected(lead);
          preview.reset();
        }}
        onSearch={setLeadSearch}
        onTry={() => selected && preview.mutate(selected.leadId)}
        preview={preview.data}
        selected={selected}
      />
      <PromptSheet
        isOpen={prompt.isSuccess}
        onClose={() => prompt.reset()}
        prompt={prompt.data}
      />
    </div>
  );
};
