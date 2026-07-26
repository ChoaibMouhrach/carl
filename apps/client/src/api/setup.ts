import { http } from "@/lib/http";
import { BaseApi } from "@/lib/base-api";

export class PlatformSetupApi extends BaseApi {
  public setup(input: { email: string; name: string; password: string }) {
    return this.call(() => {
      return http.api["platform-setup"].$post({
        json: {
          email: input.email,
          name: input.name,
          password: input.password,
        },
      });
    });
  }

  public check() {
    return this.call(() => {
      return http.api["platform-setup"].$get();
    });
  }
}
