import { BaseService } from "@server/lib/base-service";
import { AuthService } from "./auth";
import { SETUP_KEY } from "@server/config/constants";
import { BadRequestError } from "@server/lib/errors";
import type { Repositories } from "@server/repositories";

export class PlatformSetupService extends BaseService {
  public async checkSetup(
    tx: Repositories = this.context.repositories,
  ): Promise<boolean> {
    const setting = await tx.setting.findByKey({
      key: SETUP_KEY,
    });

    return !!setting;
  }

  public async setup(input: { email: string; password: string }) {
    return this.context.repositories.transaction(async ({ tx }) => {
      const isSetupDone = await this.checkSetup(tx);

      if (isSetupDone) {
        throw new BadRequestError({
          message: "Setup already completed",
          code: "setupAlreadyCompleted",
        });
      }

      const user = await tx.user.create({
        email: input.email,
        role: "admin",
        emailVerifiedAt: new Date(),
      });

      const hashedPassword = await AuthService.hashPassword(input.password);
      await tx.password.create({
        hashedPassword,
        userId: user.userId,
      });

      await tx.setting.create({
        key: SETUP_KEY,
        value: JSON.stringify(true),
      });
    });
  }
}
