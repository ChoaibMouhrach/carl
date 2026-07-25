import type { Role } from "@server/config/constants";
import { ConflictError, NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";
import { AuthService } from "./auth";

export class UserService extends BaseService {
  public async create(input: { email: string; password: string; role: Role }) {
    return await this.context.repositories.transaction(async ({ tx }) => {
      const existing = await tx.user.findByEmail({ email: input.email });

      if (existing) {
        throw new ConflictError({
          message: "Email is already taken.",
          code: "emailAlreadyTaken",
        });
      }

      const user = await tx.user.create({
        email: input.email,
        role: input.role,
        emailVerifiedAt: new Date(),
      });

      const hashedPassword = await AuthService.hashPassword(input.password);

      await tx.password.create({
        userId: user.userId,
        hashedPassword,
      });
    });
  }

  public async list(query: { page?: number; search?: string; role?: Role }) {
    return await this.context.repositories.transaction(async ({ tx }) => {
      const page = query.page || 1;

      const { users, lastPage } = await tx.user.list({
        page,
        search: query.search,
        role: query.role,
      });

      return {
        users,
        meta: {
          page,
          lastPage,
        },
      };
    });
  }

  public async show(params: { userId: number }) {
    const user = await this.context.repositories.user.findByUserId({
      userId: params.userId,
    });

    if (!user) {
      throw new NotFoundError({
        message: "User not found.",
        code: "userNotFound",
      });
    }

    return { user };
  }

  public async remove(params: { userId: number }) {
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
