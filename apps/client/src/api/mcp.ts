import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class McpApi extends BaseApi {
  public listConnections() {
    return this.call(() => http.api.mcp.connections.$get());
  }

  public revokeConnection(clientId: string) {
    return this.call(() =>
      http.api.mcp.connections[":clientId"].$delete({
        param: { clientId },
      }),
    );
  }
}
