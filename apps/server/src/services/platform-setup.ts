import { BaseService } from "@server/lib/base-service";
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

  public async setup(input: { email: string; name: string; password: string }) {
    const isSetupDone = await this.checkSetup();

    if (isSetupDone) {
      throw new BadRequestError({
        message: "Setup already completed",
        code: "setupAlreadyCompleted",
      });
    }

    const result = await this.context.auth.api.signUpEmail({
      body: { email: input.email, name: input.name, password: input.password },
    });

    await this.context.repositories.user.update(
      { userId: result.user.id },
      { emailVerified: true, role: "admin" },
    );

    await this.context.repositories.transaction(async ({ tx }) => {
      await tx.setting.create({
        key: SETUP_KEY,
        value: JSON.stringify(true),
      });
    });
  }
}
