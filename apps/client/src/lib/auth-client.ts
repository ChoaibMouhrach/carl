import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { env } from "@/config/env";

export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
  plugins: [adminClient()],
});

interface AuthClientResult<T> {
  data?: T | null;
  error?: {
    code?: string;
    message?: string;
    status?: number;
  } | null;
}

export class AuthClientError extends Error {
  public code?: string;
  public statusCode?: number;

  public constructor(input: {
    code?: string;
    message: string;
    statusCode?: number;
  }) {
    super(input.message);
    this.code = input.code;
    this.statusCode = input.statusCode;
  }
}

export const unwrapAuthResponse = async <T>(
  request: Promise<AuthClientResult<T>>,
): Promise<T> => {
  const response = await request;

  if (response.error) {
    throw new AuthClientError({
      code: response.error.code,
      message: response.error.message ?? "Something went wrong",
      statusCode: response.error.status,
    });
  }

  if (response.data === null || response.data === undefined) {
    throw new AuthClientError({ message: "Something went wrong" });
  }

  return response.data;
};
