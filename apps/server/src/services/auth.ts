import {
  AUTH_SESSION_EXPIRATION_DURATION_MS,
  EMAIL_ADDRESS_VERIFICATION_EXPIRATION_DURATION_MS,
  RESET_PASSWORD_EXPIRATION_DURATION_MS,
} from "@server/config/constants";
import { AppRedirect } from "@server/http/utils";
import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "@server/lib/errors";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NotificationService } from "./notification";

export class AuthService extends BaseService {
  private static passwordHashSalt = 12;

  public static async generateSession() {
    return crypto.randomBytes(32).toString("hex");
  }

  public static async hashPassword(password: string) {
    return await bcrypt.hash(password, AuthService.passwordHashSalt);
  }

  private async generateToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  private async comparePassword(input: {
    password: string;
    hashedPassword: string;
  }) {
    return await bcrypt.compare(input.password, input.hashedPassword);
  }

  public async signUp(input: { email: string; password: string }) {
    const outcome = await this.context.repositories.transaction(
      async ({ tx }) => {
        const existing = await tx.user.findByEmail({ email: input.email });

        if (existing?.emailVerifiedAt) {
          return { kind: "verified_existing" as const, email: existing.email };
        }

        const hashedPassword = await AuthService.hashPassword(input.password);
        const verificationToken = await this.generateToken();
        const expiresAt = new Date(
          Date.now() + EMAIL_ADDRESS_VERIFICATION_EXPIRATION_DURATION_MS,
        );

        let userId: number;

        if (existing) {
          await tx.password.updateByUserId(
            { userId: existing.userId },
            { hashedPassword },
          );
          await tx.token.removeByUserIdAndType({
            userId: existing.userId,
            type: "email-verification",
          });
          userId = existing.userId;
        } else {
          const created = await tx.user.create({
            email: input.email,
            role: "user",
            emailVerifiedAt: null,
          });
          await tx.password.create({
            hashedPassword,
            userId: created.userId,
          });
          userId = created.userId;
        }

        await tx.token.create({
          userId,
          token: verificationToken,
          type: "email-verification",
          expiresAt,
        });

        return {
          kind: "verification_sent" as const,
          email: input.email,
          verificationToken,
        };
      },
    );

    if (outcome.kind === "verified_existing") {
      await this.context.mailer.email({
        from: "auth",
        to: [outcome.email],
        subject: "Someone tried to sign up with your email",
        html: `<p>Someone attempted to create an account with this email address. If it wasn't you, no action is required. If it was you, sign in or reset your password instead.</p>`,
      });
      return;
    }

    const url = new URL(
      "/api/auth/verify-email-address",
      this.context.env.VITE_API_URL,
    );
    url.searchParams.set("token", outcome.verificationToken);

    await this.context.mailer.email({
      from: "auth",
      to: [outcome.email],
      subject: "Email verification",
      html: `<a href="${url.toString()}">Verify email address</a>`,
    });
  }

  public async verifyEmailAddress(input: { token: string }) {
    const { email } = await this.context.repositories.transaction(
      async ({ tx }) => {
        const token = await tx.token.findByToken({
          token: input.token,
        });

        const clientUrl = new URL("/error", this.context.env.CLIENT_URL);

        if (!token || token.type !== "email-verification") {
          clientUrl.searchParams.set(
            "error",
            "The email verification link is invalid or has already been used.",
          );

          throw new AppRedirect({
            to: clientUrl,
          });
        }

        if (new Date() >= token.expiresAt) {
          clientUrl.searchParams.set(
            "error",
            "The email verification link has expired. Please sign up again to receive a new one.",
          );

          throw new AppRedirect({
            to: clientUrl,
          });
        }

        await tx.user.update(
          { userId: token.userId },
          { emailVerifiedAt: new Date() },
        );

        await tx.token.removeByUserIdAndType({
          type: "email-verification",
          userId: token.userId,
        });

        const user = await tx.user.findByUserId({
          userId: token.userId,
        });

        if (!user) {
          throw new Error("User cannot be null");
        }

        return {
          email: user.email,
        };
      },
    );

    // TODO: add client side page
    const url = new URL("email-verified", this.context.env.CLIENT_URL);

    url.searchParams.set("email", email);

    throw new AppRedirect({
      to: url.toString(),
    });
  }

  public signIn(input: { email: string; password: string }) {
    return this.context.repositories.transaction(async ({ tx }) => {
      const user = await tx.user.findByEmail({
        email: input.email,
      });

      const credsValidationErrorMessage = "Invalid email address or password.";

      if (!user) {
        await AuthService.hashPassword(input.password);

        throw new UnauthorizedError({
          message: credsValidationErrorMessage,
        });
      }

      const password = await tx.password.findFirstByUserId({
        userId: user.userId,
      });

      if (!password) {
        throw new Error("A password cannot exist without a user.");
      }

      const passwordCorrect = await this.comparePassword({
        password: input.password,
        hashedPassword: password.hashedPassword,
      });

      if (!passwordCorrect) {
        throw new UnauthorizedError({
          message: credsValidationErrorMessage,
        });
      }

      if (!user.emailVerifiedAt) {
        throw new UnauthorizedError({
          message:
            "Your email address has not been verified. Please sign up again to receive a new verification link.",
        });
      }

      const generatedSession = await AuthService.generateSession();

      await tx.session.create({
        session: generatedSession,
        userId: user.userId,
        expiresAt: new Date(Date.now() + AUTH_SESSION_EXPIRATION_DURATION_MS),
      });

      return {
        user,
        session: generatedSession,
        lifeTimeMS: AUTH_SESSION_EXPIRATION_DURATION_MS,
      };
    });
  }

  public async forgetPassword(input: { email: string }) {
    const outcome = await this.context.repositories.transaction(
      async ({ tx }) => {
        const user = await tx.user.findByEmail({ email: input.email });

        if (!user) return null;

        await tx.token.removeByUserIdAndType({
          userId: user.userId,
          type: "reset-password",
        });

        const generatedToken = await this.generateToken();
        await tx.token.create({
          userId: user.userId,
          token: generatedToken,
          type: "reset-password",
          expiresAt: new Date(
            Date.now() + RESET_PASSWORD_EXPIRATION_DURATION_MS,
          ),
        });

        return { email: user.email, token: generatedToken };
      },
    );

    if (!outcome) return;

    const url = new URL("/reset-password", this.context.env.CLIENT_URL);
    url.searchParams.set("token", outcome.token);

    await this.context.mailer.email({
      from: "auth",
      to: [outcome.email],
      subject: "Reset password request",
      html: `<a href="${url.toString()}">Reset password</a>`,
    });
  }

  public resetPassword(input: { token: string; password: string }) {
    return this.context.repositories.transaction(async ({ tx }) => {
      const token = await tx.token.findByToken({
        token: input.token,
      });

      if (!token || token.type !== "reset-password") {
        throw new BadRequestError({
          message:
            "The password reset link is invalid or has already been used.",
        });
      }

      await tx.token.removeByTokenId({
        tokenId: token.tokenId,
      });

      if (new Date() > token.expiresAt) {
        throw new BadRequestError({
          message:
            "The password reset link has expired. Please request a new one.",
        });
      }

      const hashedPassword = await AuthService.hashPassword(input.password);

      const [user] = await Promise.all([
        tx.user.findByUserId({
          userId: token.userId,
        }),
        tx.password.updateByUserId(
          { userId: token.userId },
          {
            hashedPassword,
          },
        ),
        tx.session.removeByUserId({
          userId: token.userId,
        }),
      ]);

      if (!user) {
        throw new Error("User is supposed to exist");
      }

      if (user.emailVerifiedAt) {
        return;
      }

      await tx.user.update(
        { userId: user.userId },
        { emailVerifiedAt: new Date() },
      );
    });
  }

  public async me(input: { session: string }) {
    return this.context.repositories.transaction(async ({ tx }) => {
      const session = await tx.session.findBySession({
        session: input.session,
      });

      if (!session) {
        throw new UnauthorizedError({
          message: "Your session is invalid. Please sign in again.",
        });
      }

      if (new Date() > session.expiresAt) {
        throw new UnauthorizedError({
          message: "Your session has expired. Please sign in again.",
        });
      }

      const user = await tx.user.findByUserId({
        userId: session.userId,
      });

      if (!user) {
        throw new Error("A session cannot exist without a user.");
      }

      return {
        session,
        user,
      };
    });
  }

  public async signOut(input: { session: string }) {
    return this.context.repositories.transaction(async ({ tx }) => {
      await tx.session.removeBySession({
        session: input.session,
      });
    });
  }

  public async changeEmail(input: { email: string; userId: number }) {
    const existing = await this.context.repositories.user.findByEmail({
      email: input.email,
    });

    if (existing && existing.userId !== input.userId) {
      throw new ConflictError({ message: "Email is already taken." });
    }

    const customer =
      await this.context.repositories.billing.findCustomerByUserId({
        userId: input.userId,
      });

    if (customer) {
      await this.context.billing.updateCustomerEmail({
        email: input.email,
        providerCustomerId: customer.providerCustomerId,
      });
    }

    await this.context.repositories.user.update(
      { userId: input.userId },
      { email: input.email },
    );

    await new NotificationService({ context: this.context }).send({
      body: "The email address on your account was changed.",
      data: { link: "/user/account" },
      title: "Your account email was changed",
      type: "account.email_changed",
      userId: input.userId,
    });
  }

  public async changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
    sessionId: number;
    userId: number;
  }) {
    await this.context.repositories.transaction(async ({ tx }) => {
      const password = await tx.password.findFirstByUserId({
        userId: input.userId,
      });

      if (!password) {
        throw new Error("A password cannot exist without a user.");
      }

      const samePassword = await this.comparePassword({
        password: input.currentPassword,
        hashedPassword: password.hashedPassword,
      });

      if (!samePassword) {
        throw new BadRequestError({
          message: "Invalid password",
        });
      }

      const newHashedPassword = await AuthService.hashPassword(
        input.newPassword,
      );
      await tx.password.updateByUserId(
        { userId: password.userId },
        { hashedPassword: newHashedPassword },
      );

      if (input.revokeOtherSessions) {
        await tx.session.removeAllButSessionId({
          sessionId: input.sessionId,
          userId: input.userId,
        });
      }
    });

    await new NotificationService({ context: this.context }).send({
      body: input.revokeOtherSessions
        ? "Your password was changed and other sessions were signed out."
        : "Your password was changed. If this wasn't you, reset it right away.",
      title: "Your password was changed",
      type: "account.password_changed",
      userId: input.userId,
    });
  }
}
