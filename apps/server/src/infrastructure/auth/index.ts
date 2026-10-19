import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, mcp } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { ENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  accountTable,
  oauthAccessTokenTable,
  oauthApplicationTable,
  oauthConsentTable,
  passkeyTable,
  sessionTable,
  userTable,
  verificationTable,
} from "@server/infrastructure/database/schemas";
import type { BaseQueueHub } from "@server/lib/base-queue";
import {
  renderConfirmEmailChange,
  renderResetPassword,
  renderVerifyEmail,
} from "@server/emails";

export const createAuth = (input: {
  db: DB;
  env: ENV;
  queueHub: BaseQueueHub;
}) => {
  const clientUrl = new URL(input.env.CLIENT_URL);

  return betterAuth({
    baseURL: input.env.VITE_API_URL,
    secret: input.env.BETTER_AUTH_SECRET,
    trustedOrigins: [input.env.CLIENT_URL],
    database: drizzleAdapter(input.db, {
      provider: "pg",
      schema: {
        account: accountTable,
        oauthAccessToken: oauthAccessTokenTable,
        oauthApplication: oauthApplicationTable,
        oauthConsent: oauthConsentTable,
        passkey: passkeyTable,
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
    },
    emailVerification: {
      sendOnSignIn: true,
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
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ newEmail, url, user }) => {
          const html = await renderConfirmEmailChange({
            newEmail,
            url,
            logoUrl: input.env.LOGO_URL,
          });
          await input.queueHub.email.add({
            from: "auth",
            html,
            subject: "Confirm your email address change",
            to: [user.email],
          });
        },
      },
    },
    plugins: [
      admin(),
      mcp({
        loginPage: `${clientUrl.origin}/sign-in`,
        resource: `${input.env.VITE_API_URL}/api/mcp`,
      }),
      passkey({
        rpID: clientUrl.hostname,
        rpName: "Carl",
        origin: clientUrl.origin,
      }),
    ],
  });
};

export type Auth = ReturnType<typeof createAuth>;
