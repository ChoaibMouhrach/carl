import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BaseStorage } from "@server/lib/base-storage";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

interface S3StorageInit {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  forcePathStyle?: boolean;
}

export class S3Storage extends BaseStorage {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  public constructor(init: S3StorageInit) {
    super();

    this.bucket = init.bucket;
    this.publicUrl = init.publicUrl.replace(/\/$/, "");

    this.client = new S3Client({
      region: init.region,
      endpoint: init.endpoint,
      forcePathStyle: init.forcePathStyle,
      credentials: {
        accessKeyId: init.accessKeyId,
        secretAccessKey: init.secretAccessKey,
      },
    });
  }

  public override async getSignedUrl(input: {
    key: string;
    contentType: string;
  }): Promise<{ signedUrl: string; url: string }> {
    const command = new PutObjectCommand({
      Key: input.key,
      Bucket: this.bucket,
      ContentType: input.contentType,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: 3600,
    });

    return {
      signedUrl,
      url: `${this.publicUrl}/${input.key}`,
    };
  }

  public override async uploadFile(input: {
    key: string;
    contentType: string;
    body: Buffer;
  }): Promise<{ url: string }> {
    const command = new PutObjectCommand({
      Key: input.key,
      Bucket: this.bucket,
      ContentType: input.contentType,
      Body: input.body,
    });

    await this.client.send(command);

    return { url: `${this.publicUrl}/${input.key}` };
  }

  public override async getSignedDownloadUrl(input: {
    key: string;
    fileName: string;
  }): Promise<{ signedUrl: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentDisposition: `attachment; filename="${input.fileName}"`,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: 300,
    });

    return { signedUrl };
  }

  public override async removeFile(input: { key: string }): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
    });

    await this.client.send(command);
  }

  public override async createMultipartUpload(input: {
    key: string;
    contentType: string;
  }): Promise<{ uploadId: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });

    const result = await this.client.send(command);

    return { uploadId: result.UploadId! };
  }

  public override async getUploadPartUrls(input: {
    key: string;
    uploadId: string;
    partCount: number;
  }): Promise<{ parts: { partNumber: number; signedUrl: string }[] }> {
    const parts = await Promise.all(
      Array.from({ length: input.partCount }, async (_, index) => {
        const partNumber = index + 1;
        const command = new UploadPartCommand({
          Bucket: this.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: partNumber,
        });

        const signedUrl = await getSignedUrl(this.client, command, {
          expiresIn: 3600,
        });

        return { partNumber, signedUrl };
      }),
    );

    return { parts };
  }

  public override async completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; eTag: string }[];
  }): Promise<{ url: string }> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.eTag,
        })),
      },
    });

    await this.client.send(command);

    return { url: `${this.publicUrl}/${input.key}` };
  }

  public override async abortMultipartUpload(input: {
    key: string;
    uploadId: string;
  }): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: input.key,
      UploadId: input.uploadId,
    });

    await this.client.send(command);
  }
}
