import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ServerErrorCode } from "@repo/constants/errors";

interface AppErrorConstructorParams {
  statusCode: ContentfulStatusCode;
  message: string;
  code?: ServerErrorCode;
}

export class AppError extends Error {
  public statusCode: ContentfulStatusCode;
  public code?: ServerErrorCode;

  public constructor(input: AppErrorConstructorParams) {
    super(input.message);
    this.statusCode = input.statusCode;
    this.code = input.code;
  }
}

export class UnauthorizedError extends AppError {
  public constructor(input: Omit<AppErrorConstructorParams, "statusCode">) {
    super({
      statusCode: 401,
      message: input.message,
      code: input.code,
    });
  }
}

export class ForbiddenError extends AppError {
  public constructor() {
    super({
      statusCode: 403,
      message: "Permission denied.",
      code: "permissionDenied",
    });
  }
}

export class ConflictError extends AppError {
  public constructor(input: { message: string; code?: ServerErrorCode }) {
    super({
      statusCode: 409,
      message: input.message,
      code: input.code,
    });
  }
}

export class NotFoundError extends AppError {
  public constructor(input: Omit<AppErrorConstructorParams, "statusCode">) {
    super({
      statusCode: 404,
      message: input.message,
      code: input.code,
    });
  }
}

export class BadRequestError extends AppError {
  public constructor(input: Omit<AppErrorConstructorParams, "statusCode">) {
    super({
      statusCode: 400,
      message: input.message,
      code: input.code,
    });
  }
}
