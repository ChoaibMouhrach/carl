import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class UserApi extends BaseApi {
  public list(query?: {
    page?: number;
    search?: string;
    role?: "admin" | "user";
  }) {
    return this.call(() =>
      http.api.users.$get({
        query: {
          page: query?.page?.toString(),
          search: query?.search,
          role: query?.role,
        },
      }),
    );
  }

  public show(where: { userId: string }) {
    return this.call(() =>
      http.api.users[":userId"].$get({
        param: {
          userId: where.userId,
        },
      }),
    );
  }

  public create(input: {
    email: string;
    password: string;
    role: "admin" | "user";
  }) {
    return this.call(() =>
      http.api.users.$post({
        json: {
          email: input.email,
          password: input.password,
          role: input.role,
        },
      }),
    );
  }

  public remove(where: { userId: string }) {
    return this.call(() =>
      http.api.users[":userId"].$delete({
        param: {
          userId: where.userId,
        },
      }),
    );
  }

  public resendVerification(where: { userId: string }) {
    return this.call(() =>
      http.api.users[":userId"].auth["resend-verification"].$post({
        param: { userId: where.userId },
      }),
    );
  }

  public resendPasswordReset(where: { userId: string }) {
    return this.call(() =>
      http.api.users[":userId"].auth["resend-password-reset"].$post({
        param: { userId: where.userId },
      }),
    );
  }
}
