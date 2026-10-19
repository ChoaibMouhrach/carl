import { UserRepository } from "./user";
import type { DBConnection } from "@server/infrastructure/database/client";
import { SettingRepository } from "./setting";
import { HealthRepository } from "./health";
import { LeadRepository } from "./lead";
import { CommunityRepository } from "./community";
import { CampaignRepository } from "./campaign";
import { CampaignLeadRepository } from "./campaign-lead";
import { ScrapeRunRepository } from "./scrape-run";
import { OAuthClientRepository } from "./oauth-client";

interface RepositoriesConstructorProps {
  dbConnection: DBConnection;
}

export class Repositories {
  private pool;
  public db;

  public user;
  public setting;
  public health;
  public lead;
  public community;
  public campaign;
  public campaignLead;
  public scrapeRun;
  public oauthClient;

  public constructor({ dbConnection }: RepositoriesConstructorProps) {
    this.pool = dbConnection.pool;
    this.db = dbConnection.db;

    this.user = new UserRepository({
      db: dbConnection.db,
    });

    this.health = new HealthRepository({
      db: dbConnection.db,
    });

    this.setting = new SettingRepository({
      db: dbConnection.db,
    });

    this.lead = new LeadRepository({
      db: dbConnection.db,
    });

    this.community = new CommunityRepository({
      db: dbConnection.db,
    });

    this.campaign = new CampaignRepository({
      db: dbConnection.db,
    });

    this.campaignLead = new CampaignLeadRepository({
      db: dbConnection.db,
    });

    this.scrapeRun = new ScrapeRunRepository({
      db: dbConnection.db,
    });

    this.oauthClient = new OAuthClientRepository({
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
