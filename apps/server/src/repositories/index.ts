import { UserRepository } from "./user";
import type { DBConnection } from "@server/infrastructure/database/client";
import { SettingRepository } from "./setting";
import { FileRepository } from "./file";
import { BillingRepository } from "./billing";
import { NotificationRepository } from "./notification";

interface RepositoriesConstructorProps {
  dbConnection: DBConnection;
}

export class Repositories {
  private pool;
  public db;

  public user;
  public setting;
  public file;
  public billing;
  public notification;

  public constructor({ dbConnection }: RepositoriesConstructorProps) {
    this.pool = dbConnection.pool;
    this.db = dbConnection.db;

    this.user = new UserRepository({
      db: dbConnection.db,
    });

    this.setting = new SettingRepository({
      db: dbConnection.db,
    });

    this.file = new FileRepository({
      db: dbConnection.db,
    });

    this.billing = new BillingRepository({
      db: dbConnection.db,
    });

    this.notification = new NotificationRepository({
      db: dbConnection.db,
    });
  }

  public async transaction<R>(
    cb: (transaction: { tx: Repositories }) => Promise<R>,
  ): Promise<R> {
    return await this.db.transaction(async (tx) => {
      const repositories = new Repositories({
        dbConnection: {
          db: tx,
          pool: this.pool,
        },
      });

      return cb({
        tx: repositories,
      });
    });
  }

  public async close() {
    await this.pool.end();
  }
}
