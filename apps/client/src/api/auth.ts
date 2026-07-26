import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class AuthApi extends BaseApi {
  public me() {
    return this.call(() => {
      return http.api.billing.me.$get();
    });
  }
}
