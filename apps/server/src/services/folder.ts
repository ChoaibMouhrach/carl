import { NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";

export class FolderService extends BaseService {
  private async assertClientOwnership(where: {
    clientId: number;
    userId: string;
  }) {
    const client = await this.context.repositories.client.findByClientId(where);

    if (!client) {
      throw new NotFoundError({ message: "Client not found." });
    }
  }

  private async assertParentFolder(where: {
    parentId: number | null;
    clientId: number;
    userId: string;
  }) {
    if (where.parentId === null) return;

    const parent = await this.context.repositories.folder.findByFolderId({
      folderId: where.parentId,
      clientId: where.clientId,
      userId: where.userId,
    });

    if (!parent) {
      throw new NotFoundError({ message: "Parent folder not found." });
    }
  }

  public async list(query: {
    clientId: number;
    userId: string;
    parentId: number | null;
    page?: number;
    search?: string;
  }) {
    await this.assertClientOwnership(query);
    await this.assertParentFolder(query);

    const page = query.page || 1;

    const { folders, lastPage } = await this.context.repositories.folder.list({
      ...query,
      page,
    });

    return { folders, meta: { page, lastPage } };
  }

  public async getPath(where: {
    folderId: number;
    clientId: number;
    userId: string;
  }) {
    await this.assertClientOwnership(where);

    const path = await this.context.repositories.folder.getPath(where);

    if (path.at(-1)?.folderId !== where.folderId) {
      throw new NotFoundError({ message: "Folder not found." });
    }

    return path;
  }

  public async create(input: {
    clientId: number;
    userId: string;
    parentId: number | null;
    name: string;
  }) {
    await this.assertClientOwnership(input);
    await this.assertParentFolder(input);

    return await this.context.repositories.folder.create(input);
  }

  public async update(
    where: { folderId: number; clientId: number; userId: string },
    input: { name: string },
  ) {
    await this.assertClientOwnership(where);

    const folder = await this.context.repositories.folder.update(where, input);

    if (!folder) {
      throw new NotFoundError({ message: "Folder not found." });
    }

    return folder;
  }

  public async remove(where: {
    folderId: number;
    clientId: number;
    userId: string;
  }) {
    await this.assertClientOwnership(where);

    const folder = await this.context.repositories.folder.findByFolderId(where);

    if (!folder) {
      throw new NotFoundError({ message: "Folder not found." });
    }

    await this.context.repositories.folder.remove(where);
  }
}
