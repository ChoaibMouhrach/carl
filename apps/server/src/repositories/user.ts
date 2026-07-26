import { and, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Role } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { userTable, type User } from "@server/infrastructure/database/schemas";

export class UserRepository extends BaseRepository {
  private static table = userTable;

  public async list(query: {
    page: number;
    search?: string;
    role?: Role;
    emailVerified?: boolean;
  }) {
    const conditions = [];
    if (query.search) {
      conditions.push(ilike(UserRepository.table.email, `%${query.search}%`));
    }
    if (query.role) {
      conditions.push(eq(UserRepository.table.role, query.role));
    }
    if (query.emailVerified !== undefined) {
      conditions.push(
        eq(UserRepository.table.emailVerified, query.emailVerified),
      );
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

  public async create(input: {
    id?: string;
    name?: string;
    email: string;
    role: Role;
    emailVerified?: boolean;
    emailVerifiedAt?: Date;
  }) {
    const users = await this.db
      .insert(UserRepository.table)
      .values({
        email: input.email,
        emailVerified: input.emailVerified ?? Boolean(input.emailVerifiedAt),
        id: input.id ?? randomUUID(),
        name: input.name ?? input.email,
        role: input.role,
      })
      .returning();

    const user = users.at(0)!;

    return { ...user, userId: user.id };
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

  public async remove(where: { userId: string }) {
    await this.db
      .delete(UserRepository.table)
      .where(eq(UserRepository.table.id, where.userId));
  }
}
