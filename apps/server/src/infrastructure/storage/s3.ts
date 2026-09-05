import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BaseStorage } from "@server/lib/base-storage";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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
}
