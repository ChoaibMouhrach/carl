import { isRedirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ROUTER_BASEPATH } from "@/config/constants";

export type FieldError = {
  field: string;
  message: string;
};

export const onError = (error: Error) => {
  if (isRedirect(error)) {
    throw error;
  }

  let message = error.message;

  if (error instanceof ApiError) {
    message = error.message;
  }

  toast.error(message);
};

export class ApiError extends Error {
  public statusCode;

  public constructor(payload: { statusCode: number; message: string }) {
    super(payload.message);
    this.statusCode = payload.statusCode;
  }
}

const errorSchema = z.object({
  message: z.string(),
  statusCode: z.number(),
});

export abstract class BaseApi {
  protected async call<
    T extends Promise<Response>,
    B = Awaited<ReturnType<Awaited<T>["json"]>>,
  >(cb: () => T): Promise<B> {
    const somethingWentWrongError = new ApiError({
      statusCode: 500,
      message: "Something went wrong",
    });

    try {
      const response = await cb();

      const isJson = response.headers
        .get("Content-Type")
        ?.includes("application/json");

      if (!response.ok && !isJson) {
        throw somethingWentWrongError;
      }

      if (!response.ok) {
        const data = await response.json();

        const validation = errorSchema.safeParse(data);

        if (!validation.success) {
          throw somethingWentWrongError;
        }

        if (validation.data.statusCode === 401) {
          const currentPath = window.location.pathname;
          const isOnAuthPage = [
            "/sign-in",
            "/sign-up",
            "/email-verified",
            "/forgot-password",
            "/reset-password",
          ].some((path) => currentPath.endsWith(path));

          if (!isOnAuthPage) {
            window.location.href = `${ROUTER_BASEPATH}/sign-in`;
          }
        }

        throw new ApiError({
          statusCode: validation.data.statusCode,
          message: validation.data.message,
        });
      }

      if (!isJson) {
        return undefined as B;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new ApiError({
          statusCode: 599,
          message:
            "A network error occurred. Please check your internet connection",
        });
      }

      throw somethingWentWrongError;
    }
  }
}
