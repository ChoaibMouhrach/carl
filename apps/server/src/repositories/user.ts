import { eq } from "drizzle-orm";
import type { Role } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import { userTable, type User } from "@server/infrastructure/database/schemas";

export class UserRepository extends BaseRepository {
  private static table = userTable;

  public async findByUserId(where: { userId: string }): Promise<User | null> {
    const users = await this.db
      .select()
      .from(UserRepository.table)
      .where(eq(UserRepository.table.id, where.userId))
      .limit(1);

    return users.at(0) || null;
  }

  public async findByEmail(where: { email: string }): Promise<User | null> {
    const users = await this.db
      .select()
      .from(UserRepository.table)
      .where(eq(UserRepository.table.email, where.email))
      .limit(1);

    return users.at(0) || null;
  }

  public async update(
    where: { userId: string },
    input: Partial<{ email: string; emailVerified: boolean; role: Role }>,
  ) {
    await this.db
      .update(UserRepository.table)
      .set(input)
      .where(eq(UserRepository.table.id, where.userId));
  }
}
