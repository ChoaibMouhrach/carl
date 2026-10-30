import { adminCampaignRoute } from "@/routes/admin/campaign";
import { LeadList } from "../leads/leads";

export const CampaignLeads = () => {
  const { campaignId } = adminCampaignRoute.useParams();
  const searchParams = adminCampaignRoute.useSearch();
  const navigate = adminCampaignRoute.useNavigate();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Leads</h2>
      <LeadList
        campaignId={campaignId}
        emptyDescription="Run the scrape to collect leads for this campaign."
        searchParams={{
          page: searchParams.page,
          perPage: searchParams.perPage,
          search: searchParams.search,
          hasEmail: searchParams.hasEmail,
          stage: searchParams.stage,
          sort: searchParams.sort,
          order: searchParams.order,
          campaignId: undefined,
        }}
        navigate={({ search }) =>
          navigate({
            search: (current) => {
              const next = search({
                page: current.page,
                perPage: current.perPage,
                search: current.search,
                hasEmail: current.hasEmail,
                stage: current.stage,
                sort: current.sort,
                order: current.order,
                campaignId: undefined,
              });
              return {
                ...current,
                page: next.page,
                perPage: next.perPage,
                search: next.search,
                hasEmail: next.hasEmail,
                stage: next.stage,
                sort: next.sort,
                order: next.order,
              };
            },
          })
        }
      />
    </section>
  );
};
