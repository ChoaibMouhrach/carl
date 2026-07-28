import { deleteCookie } from "hono/cookie";
import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "../middlewares/auth";
import { deleteAccountSchema } from "../validations/account";

export const accountController = new Hono<AppContext>()
  .use(authMiddleware)
  .delete(
    "/",
    describeRoute({ tags: ["account"] }),
    validator("json", deleteAccountSchema),
    async (context) => {
      const { userId } = context.get("auth").user;

      await context.get("services").user.remove({ userId });

      deleteCookie(context, "better-auth.session_token", { path: "/" });
      deleteCookie(context, "__Secure-better-auth.session_token", {
        path: "/",
        secure: true,
      });

      return context.body(null, 204);
    },
  );
