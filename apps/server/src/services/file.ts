import crypto from "crypto";
import { NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";
import { MULTIPART_PART_SIZE_BYTES } from "@repo/constants/files";

export class FileService extends BaseService {
  public async list(where: { userId: string; page?: number; search?: string }) {
    const page = where.page || 1;

    const { files, lastPage } = await this.context.repositories.file.listByUser(
      {
        userId: where.userId,
        page,
        search: where.search,
      },
    );

    return { files, meta: { page, lastPage } };
  }

  private async generateUniqueName(where: { userId: string }, name: string) {
    const dotIndex = name.lastIndexOf(".");
    const hasExtension = dotIndex >= 0;
    const base = hasExtension ? name.slice(0, dotIndex) : name;
    const extension = hasExtension ? name.slice(dotIndex) : "";

    let candidate = name;
    let attempt = 1;

    while (
      await this.context.repositories.file.existsByName({
        ...where,
        name: candidate,
      })
    ) {
      candidate = `${base} (${attempt})${extension}`;
      attempt += 1;
    }

    return candidate;
  }

  public async createMultipartUpload(
    where: { userId: string },
    input: { name: string; sizeBytes: number; mimeType: string },
  ) {
    const name = await this.generateUniqueName(where, input.name);
    const key = crypto.randomUUID() + name;

    const { uploadId } = await this.context.storage.createMultipartUpload({
      key,
      contentType: input.mimeType,
    });

    const partCount = Math.ceil(input.sizeBytes / MULTIPART_PART_SIZE_BYTES);
    const { parts } = await this.context.storage.getUploadPartUrls({
      key,
      uploadId,
      partCount,
    });

    return { uploadId, key, name, parts };
  }

  public async completeMultipartUpload(
    where: { userId: string },
    input: {
      uploadId: string;
      key: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      parts: { partNumber: number; eTag: string }[];
    },
  ) {
    const name = await this.generateUniqueName(where, input.name);

    const { url } = await this.context.storage.completeMultipartUpload({
      key: input.key,
      uploadId: input.uploadId,
      parts: input.parts,
    });

    const file = await this.context.repositories.file.create({
      name,
      key: input.key,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      url,
      userId: where.userId,
    });

    return file;
  }

  public async abortMultipartUpload(input: { uploadId: string; key: string }) {
    await this.context.storage.abortMultipartUpload({
      key: input.key,
      uploadId: input.uploadId,
    });
  }

  public async upload(
    where: { userId: string },
    input: { name: string; mimeType: string; sizeBytes: number; body: Buffer },
  ) {
    const name = await this.generateUniqueName(where, input.name);
    const key = crypto.randomUUID() + name;
    const { url } = await this.context.storage.uploadFile({
      key,
      contentType: input.mimeType,
      body: input.body,
    });

    const file = await this.context.repositories.file.create({
      name,
      key,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      url,
      userId: where.userId,
    });

    return file;
  }

  public async update(
    where: { userId: string; fileId: number },
    input: { name: string },
  ) {
    const file = await this.context.repositories.file.update(where, input);

    if (!file) {
      throw new NotFoundError({ message: "File not found." });
    }

    return file;
  }

  public async getDownloadUrl(where: { userId: string; fileId: number }) {
    const file = await this.context.repositories.file.findScoped(where);

    if (!file) {
      throw new NotFoundError({ message: "File not found." });
    }

    return await this.context.storage.getSignedDownloadUrl({
      key: file.key,
      fileName: file.name,
    });
  }

  public async remove(where: { userId: string; fileId: number }) {
    const file = await this.context.repositories.file.findScoped(where);

    if (!file) {
      throw new NotFoundError({ message: "File not found." });
    }

    await this.context.repositories.file.removeByFileId({
      fileId: where.fileId,
    });
    await this.context.storage.removeFile({ key: file.key });
  }
}
