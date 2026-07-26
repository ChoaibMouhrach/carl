import type { Role } from "@server/config/constants";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";

export class UserService extends BaseService {
  public async create(input: { email: string; password: string; role: Role }) {
    const result = await this.context.auth.api.createUser({
      body: {
        email: input.email,
        name: input.email,
        password: input.password,
        role: input.role,
      },
    });

    if (!result) {
      throw new ConflictError({
        message: "Email is already taken.",
        code: "emailAlreadyTaken",
      });
    }
  }

  public async list(query: { page?: number; search?: string; role?: Role }) {
    return await this.context.repositories.transaction(async ({ tx }) => {
      const page = query.page || 1;

      const { users, lastPage } = await tx.user.list({
        page,
        search: query.search,
        role: query.role,
      });

      const subscriptions = await Promise.all(
        users.map((user) =>
          tx.billing.findCurrentSubscription({ userId: user.id }),
        ),
      );

      return {
        users: users.map((user, index) => ({
          ...user,
          subscription: subscriptions[index] ?? null,
        })),
        meta: {
          page,
          lastPage,
        },
      };
    });
  }

  public async show(params: { userId: string }) {
    const user = await this.context.repositories.user.findByUserId({
      userId: params.userId,
    });

    if (!user) {
      throw new NotFoundError({
        message: "User not found.",
        code: "userNotFound",
      });
    }

    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: params.userId,
      });

    return { subscription, user };
  }

  public async resendVerification(input: { userId: string }): Promise<void> {
    const user = await this.context.repositories.user.findByUserId({
      userId: input.userId,
    });

    if (!user) {
      throw new NotFoundError({
        message: "User not found.",
        code: "userNotFound",
      });
    }

    if (user.emailVerified) {
      throw new BadRequestError({
        message: "This email address is already verified.",
      });
    }

    await this.context.auth.api.sendVerificationEmail({
      body: {
        callbackURL: `${this.context.env.CLIENT_URL}/app/email-verified?email=${encodeURIComponent(user.email)}`,
        email: user.email,
      },
    });
  }

  public async resendPasswordReset(input: { userId: string }): Promise<void> {
    const user = await this.context.repositories.user.findByUserId({
      userId: input.userId,
    });

    if (!user) {
      throw new NotFoundError({
        message: "User not found.",
        code: "userNotFound",
      });
    }

    await this.context.auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: `${this.context.env.CLIENT_URL}/app/reset-password`,
      },
    });
  }

  public async remove(params: { userId: string }) {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: params.userId,
      });

    if (subscription) {
      await this.context.billing.cancelSubscriptionImmediately({
        providerSubscriptionId: subscription.providerSubscriptionId,
      });
    }

    return await this.context.repositories.transaction(async ({ tx }) => {
      const user = await tx.user.findByUserId({ userId: params.userId });

      if (!user) {
        throw new NotFoundError({
          message: "User not found.",
          code: "userNotFound",
        });
      }

      await tx.user.remove({ userId: params.userId });
    });
  }
}
