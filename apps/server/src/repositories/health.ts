import { sql } from "drizzle-orm";
import { BaseRepository } from "@server/lib/base-repository";

export class HealthRepository extends BaseRepository {
  public async ping() {
    await this.db.execute(sql`select 1`);
  }
}
