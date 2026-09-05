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
}
