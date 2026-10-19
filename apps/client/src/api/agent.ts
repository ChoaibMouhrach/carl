import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class AgentApi extends BaseApi {
  public list() {
    return this.call(() => http.api.agents.$get());
  }

  public show(where: { clientId: string }) {
    return this.call(() =>
      http.api.agents[":clientId"].$get({
        param: { clientId: where.clientId },
      }),
    );
  }

  public listRequests(where: { clientId: string; page?: number }) {
    return this.call(() =>
      http.api.agents[":clientId"].requests.$get({
        param: { clientId: where.clientId },
        query: { page: where.page?.toString() },
      }),
    );
  }

  public showRequest(where: { clientId: string; requestId: number }) {
    return this.call(() =>
      http.api.agents[":clientId"].requests[":requestId"].$get({
        param: {
          clientId: where.clientId,
          requestId: where.requestId.toString(),
        },
      }),
    );
  }

  public revoke(where: { clientId: string }) {
    return this.call(() =>
      http.api.agents[":clientId"].$delete({
        param: { clientId: where.clientId },
      }),
    );
  }
}

export type Agent = Awaited<ReturnType<AgentApi["list"]>>["agents"][number];
export type AgentDetail = Awaited<ReturnType<AgentApi["show"]>>["agent"];

export type AgentRequestSummary = Awaited<
  ReturnType<AgentApi["listRequests"]>
>["requests"][number];

export type AgentRequestDetail = Awaited<
  ReturnType<AgentApi["showRequest"]>
>["request"];
