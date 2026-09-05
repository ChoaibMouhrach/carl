export abstract class BaseStorage {
  public abstract getSignedUrl(input: {
    key: string;
    contentType: string;
  }): Promise<{ signedUrl: string; url: string }>;
  public abstract uploadFile(input: {
    key: string;
    contentType: string;
    body: Buffer;
  }): Promise<{ url: string }>;
  public abstract getSignedDownloadUrl(input: {
    key: string;
    fileName: string;
  }): Promise<{ signedUrl: string }>;
  public abstract removeFile(input: { key: string }): Promise<void>;
  public abstract createMultipartUpload(input: {
    key: string;
    contentType: string;
  }): Promise<{ uploadId: string }>;
  public abstract getUploadPartUrls(input: {
    key: string;
    uploadId: string;
    partCount: number;
  }): Promise<{ parts: { partNumber: number; signedUrl: string }[] }>;
  public abstract completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; eTag: string }[];
  }): Promise<{ url: string }>;
  public abstract abortMultipartUpload(input: {
    key: string;
    uploadId: string;
  }): Promise<void>;
}
