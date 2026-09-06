export abstract class BaseEmbeddings {
  public abstract embed(input: {
    texts: string[];
  }): Promise<{ vectors: number[][] }>;
}
