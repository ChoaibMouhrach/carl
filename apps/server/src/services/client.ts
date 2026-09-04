import { NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";

export class ClientService extends BaseService {
  public async list(query: { userId: string; page?: number; search?: string }) {
    const page = query.page || 1;

    const { clients, lastPage } = await this.context.repositories.client.list({
      userId: query.userId,
      page,
      search: query.search,
    });

    return { clients, meta: { page, lastPage } };
  }

  public async get(where: { clientId: number; userId: string }) {
    const client = await this.context.repositories.client.findByClientId(where);

    if (!client) {
      throw new NotFoundError({ message: "Client not found." });
    }

    return client;
  }

  public async create(input: { userId: string; name: string; email: string }) {
    return await this.context.repositories.client.create(input);
  }

  public async update(
    where: { clientId: number; userId: string },
    input: { name: string; email: string },
  ) {
    const client = await this.context.repositories.client.update(where, input);

    if (!client) {
      throw new NotFoundError({ message: "Client not found." });
    }

    return client;
  }

  public async remove(where: { clientId: number; userId: string }) {
    const client = await this.context.repositories.client.findByClientId(where);

    if (!client) {
      throw new NotFoundError({ message: "Client not found." });
    }

    await this.context.repositories.client.remove(where);
  }
}
