import { and, eq, lt } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";
import {
  emailEnrichmentsTable,
  type EmailEnrichment,
  type EmailEnrichmentStatus,
} from "@server/infrastructure/database/schemas";

export class EmailEnrichmentRepository extends BaseRepository {
  private static table = emailEnrichmentsTable;

  public async create(input: {
    batchId: string;
    campaignId: number;
    groups: number[][];
  }): Promise<EmailEnrichment> {
    const [created] = await this.db
      .insert(EmailEnrichmentRepository.table)
      .values(input)
      .returning();

    if (!created) throw new Error("The email enrichment was not created.");

    return created;
  }

  public async attachProviderId(
    where: { emailEnrichmentId: number },
    input: { providerId: string },
  ) {
    const table = EmailEnrichmentRepository.table;

    await this.db
      .update(table)
      .set({ providerId: input.providerId })
      .where(eq(table.emailEnrichmentId, where.emailEnrichmentId));
  }

  public async findByBatchId(where: { batchId: string }) {
    const table = EmailEnrichmentRepository.table;
    const [found] = await this.db
      .select()
      .from(table)
      .where(eq(table.batchId, where.batchId));

    return found ?? null;
  }

  public async findByProviderId(where: { providerId: string }) {
    const table = EmailEnrichmentRepository.table;
    const [found] = await this.db
      .select()
      .from(table)
      .where(eq(table.providerId, where.providerId));

    return found ?? null;
  }

  public async hasWaiting(where: { campaignId: number }) {
    const table = EmailEnrichmentRepository.table;
    const count = await this.db.$count(
      table,
      and(eq(table.campaignId, where.campaignId), eq(table.status, "waiting")),
    );

    return count > 0;
  }

  public async listWaitingBefore(where: { before: Date; limit: number }) {
    const table = EmailEnrichmentRepository.table;

    return await this.db
      .select()
      .from(table)
      .where(
        and(eq(table.status, "waiting"), lt(table.createdAt, where.before)),
      )
      .orderBy(table.createdAt)
      .limit(where.limit);
  }

  /** Settles a waiting batch exactly once: true for the one caller that got to do it */
  public async settle(
    where: { emailEnrichmentId: number },
    input: {
      status: Exclude<EmailEnrichmentStatus, "waiting">;
      failureReason: string | null;
    },
  ) {
    const table = EmailEnrichmentRepository.table;
    const settled = await this.db
      .update(table)
      .set({ ...input, finishedAt: new Date() })
      .where(
        and(
          eq(table.emailEnrichmentId, where.emailEnrichmentId),
          eq(table.status, "waiting"),
        ),
      )
      .returning({ id: table.emailEnrichmentId });

    return settled.length > 0;
  }
}
