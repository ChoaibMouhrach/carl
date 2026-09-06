import { BaseEmbeddings } from "@server/lib/base-embeddings";

const EMBEDDING_DIMENSIONS = 1536;

// Deterministic, network-free vectors for NODE_ENV=test (e2e/CI), where the
// real OpenAI key is a non-secret placeholder and can't authenticate.
export class FakeEmbeddings extends BaseEmbeddings {
  public override async embed(input: {
    texts: string[];
  }): Promise<{ vectors: number[][] }> {
    return {
      vectors: input.texts.map((text) => {
        const seed = [...text].reduce(
          (sum, char) => sum + char.charCodeAt(0),
          0,
        );
        return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) =>
          Math.sin(seed + i),
        );
      }),
    };
  }
}
