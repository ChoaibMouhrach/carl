import type { ACCOUNT_DELETION_CONFIRMATION } from "@repo/constants/auth";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class AccountApi extends BaseApi {
  public remove(input: { confirmation: typeof ACCOUNT_DELETION_CONFIRMATION }) {
    return this.call(() =>
      http.api.account.$delete({
        json: input,
      }),
    );
  }
}
