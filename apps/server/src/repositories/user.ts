import { and, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import type { Role } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { usersTable, type User } from "@server/infrastructure/database/schemas";

export class UserRepository extends BaseRepository {
  private static table = usersTable;

  public async list(query: { page: number; search?: string; role?: Role }) {
    const conditions = [];
    if (query.search) {
      conditions.push(ilike(UserRepository.table.email, `%${query.search}%`));
    }
    if (query.role) {
      conditions.push(eq(UserRepository.table.role, query.role));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [users, [countRow]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(UserRepository.table),
        })
        .from(UserRepository.table)
        .where(where)
        .orderBy(desc(UserRepository.table.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(UserRepository.table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { users, lastPage };
  }

  public async findByUserId(where: { userId: number }): Promise<User | null> {
    const users = await this.db
      .select()
      .from(UserRepository.table)
      .where(eq(UserRepository.table.userId, where.userId))
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

  public async create(input: {
    email: string;
    role: Role;
    emailVerifiedAt: Date | null;
  }) {
    const users = await this.db
      .insert(UserRepository.table)
      .values(input)
      .returning();

    return users.at(0)!;
  }

  public async update(
    where: { userId: number },
    input: Partial<{ email: string; emailVerifiedAt: Date }>,
  ) {
    await this.db
      .update(UserRepository.table)
      .set(input)
      .where(eq(UserRepository.table.userId, where.userId));
  }

  public async remove(where: { userId: number }) {
    await this.db
      .delete(UserRepository.table)
      .where(eq(UserRepository.table.userId, where.userId));
  }
}
