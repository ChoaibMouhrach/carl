import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { ENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from "@server/infrastructure/database/schemas";
import type { BaseQueueHub } from "@server/lib/base-queue";
import {
  renderResetPassword,
  renderSignupAttempt,
  renderVerifyEmail,
} from "@server/emails";

export const createAuth = (input: {
  db: DB;
  env: ENV;
  queueHub: BaseQueueHub;
}) =>
  betterAuth({
    baseURL: input.env.VITE_API_URL,
    secret: input.env.BETTER_AUTH_SECRET,
    trustedOrigins: [input.env.CLIENT_URL],
    database: drizzleAdapter(input.db, {
      provider: "pg",
      schema: {
        account: accountTable,
        session: sessionTable,
        user: userTable,
        verification: verificationTable,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const html = await renderResetPassword({
          url,
          logoUrl: input.env.LOGO_URL,
        });
        await input.queueHub.email.add({
          from: "auth",
          html,
          subject: "Reset your password",
          to: [user.email],
        });
      },
      onExistingUserSignUp: async ({ user }) => {
        const html = await renderSignupAttempt({ logoUrl: input.env.LOGO_URL });
        await input.queueHub.email.add({
          from: "auth",
          html,
          subject: "Someone tried to sign up with your email",
          to: [user.email],
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const html = await renderVerifyEmail({
          url,
          logoUrl: input.env.LOGO_URL,
        });
        await input.queueHub.email.add({
          from: "auth",
          html,
          subject: "Verify your email address",
          to: [user.email],
        });
      },
    },
    plugins: [admin()],
  });

export type Auth = ReturnType<typeof createAuth>;
