import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class AgentApi extends BaseApi {
  public list() {
    return this.call(() => http.api.agents.$get());
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
