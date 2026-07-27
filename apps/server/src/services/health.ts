import { BaseService } from "@server/lib/base-service";

export type ComponentStatus = "ok" | "down";
export type HealthStatus = "ok" | "degraded" | "unhealthy";

export interface HealthReport {
  status: HealthStatus;
  checks: {
    database: ComponentStatus;
    redis: ComponentStatus;
    email: ComponentStatus;
  };
}

export class HealthService extends BaseService {
  public async check(): Promise<HealthReport> {
    const [database, redis, email] = await Promise.all([
      this.probe(() => this.context.repositories.health.ping()),
      this.probe(() => this.context.rateLimiter.ping()),
      this.probe(() => this.context.mailer.verify()),
    ]);

    return {
      status: this.resolveStatus({ database, redis, email }),
      checks: { database, redis, email },
    };
  }

  private resolveStatus(checks: {
    database: ComponentStatus;
    redis: ComponentStatus;
    email: ComponentStatus;
  }): HealthStatus {
    if (checks.database === "down" || checks.redis === "down") {
      return "unhealthy";
    }

    if (checks.email === "down") {
      return "degraded";
    }

    return "ok";
  }

  private async probe(check: () => Promise<void>): Promise<ComponentStatus> {
    try {
      await check();
      return "ok";
    } catch {
      return "down";
    }
  }
}
