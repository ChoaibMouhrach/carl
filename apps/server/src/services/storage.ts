import crypto from "crypto";
import { BaseService } from "@server/lib/base-service";

export class StorageService extends BaseService {
  public async getSignedUrl(input: {
    userId: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
  }) {
    const key = crypto.randomUUID() + input.name;

    const { signedUrl, url } = await this.context.storage.getSignedUrl({
      contentType: input.mimeType,
      key,
    });

    const file = await this.context.repositories.file.create({
      name: input.name,
      key: key,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      url: url,
      userId: input.userId,
    });

    return { signedUrl, fileId: file.fileId, url };
  }
}
