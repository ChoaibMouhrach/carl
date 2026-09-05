import { NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";

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

  public async listEntries(where: {
    clientId: number;
    folderId: number | null;
    userId: string;
    page?: number;
    search?: string;
  }) {
    await this.assertClientOwnership(where);
    await this.assertParentFolder({
      parentId: where.folderId,
      clientId: where.clientId,
      userId: where.userId,
    });

    const page = where.page || 1;
    const limit = DEFAULT_RECORD_LIMIT;
    const windowSize = page * limit;

    const [folderCount, fileCount, topFolders, topFiles] = await Promise.all([
      this.context.repositories.folder.countByParent({
        clientId: where.clientId,
        parentId: where.folderId,
        search: where.search,
        userId: where.userId,
      }),
      this.context.repositories.file.countByLocation({
        clientId: where.clientId,
        folderId: where.folderId,
        search: where.search,
        userId: where.userId,
      }),
      this.context.repositories.folder.listTopByParent(
        {
          clientId: where.clientId,
          parentId: where.folderId,
          search: where.search,
          userId: where.userId,
        },
        windowSize,
      ),
      this.context.repositories.file.listTopByLocation(
        {
          clientId: where.clientId,
          folderId: where.folderId,
          search: where.search,
          userId: where.userId,
        },
        windowSize,
      ),
    ]);

    const folderSizes = await this.computeRecursiveFolderSizes({
      clientId: where.clientId,
      userId: where.userId,
      folderIds: topFolders.map((folder) => folder.folderId),
    });

    const merged = [
      ...topFolders.map((entry) => ({
        type: "folder" as const,
        ...entry,
        totalSizeBytes: folderSizes.get(entry.folderId) ?? 0,
      })),
      ...topFiles.map((entry) => ({ type: "file" as const, ...entry })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = (page - 1) * limit;
    const entries = merged.slice(offset, offset + limit);
    const lastPage = Math.max(1, Math.ceil((folderCount + fileCount) / limit));

    return { entries, meta: { page, lastPage } };
  }

  private async computeRecursiveFolderSizes(where: {
    clientId: number;
    userId: string;
    folderIds: number[];
  }) {
    if (where.folderIds.length === 0) return new Map<number, number>();

    const [allFolders, directSizes] = await Promise.all([
      this.context.repositories.folder.listAllByClient({
        clientId: where.clientId,
        userId: where.userId,
      }),
      this.context.repositories.file.sumSizeGroupedByFolder({
        clientId: where.clientId,
        userId: where.userId,
      }),
    ]);

    const childrenByParent = new Map<number, number[]>();
    for (const folder of allFolders) {
      if (folder.parentId === null) continue;
      const children = childrenByParent.get(folder.parentId) ?? [];
      children.push(folder.folderId);
      childrenByParent.set(folder.parentId, children);
    }

    const memo = new Map<number, number>();
    const computeTotal = (folderId: number): number => {
      const cached = memo.get(folderId);
      if (cached !== undefined) return cached;

      let total = directSizes.get(folderId) ?? 0;
      for (const childId of childrenByParent.get(folderId) ?? []) {
        total += computeTotal(childId);
      }

      memo.set(folderId, total);
      return total;
    };

    return new Map(
      where.folderIds.map((folderId) => [folderId, computeTotal(folderId)]),
    );
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
