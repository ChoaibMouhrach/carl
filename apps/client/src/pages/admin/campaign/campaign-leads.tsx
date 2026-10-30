import { adminCampaignRoute } from "@/routes/admin/campaign";
import { LeadList } from "../leads/leads";

export const CampaignLeads = () => {
  const { campaignId } = adminCampaignRoute.useParams();
  const searchParams = adminCampaignRoute.useSearch();
  const navigate = adminCampaignRoute.useNavigate();
  const emptyDescriptions = {
    scrape: "Run the scrape to collect leads for this campaign.",
    tavily: "Run enrichment to find leads with a website or LinkedIn profile.",
    website:
      "Scrape websites to list the leads with an email found on their site.",
    fullenrich: "Find emails to list the leads with a work or personal email.",
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Leads</h2>
      <LeadList
        campaignId={campaignId}
        pipelineStep={searchParams.step}
        emptyDescription={emptyDescriptions[searchParams.step]}
        searchParams={{
          page: searchParams.page,
          perPage: searchParams.perPage,
          search: searchParams.search,
          hasEmail: searchParams.hasEmail,
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
