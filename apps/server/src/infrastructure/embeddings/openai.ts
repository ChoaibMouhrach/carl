import { BaseEmbeddings } from "@server/lib/base-embeddings";
import OpenAI from "openai";

interface OpenAIEmbeddingsInit {
  apiKey: string;
}

export class OpenAIEmbeddings extends BaseEmbeddings {
  private client: OpenAI;

  public constructor(init: OpenAIEmbeddingsInit) {
    super();

    this.client = new OpenAI({ apiKey: init.apiKey });
  }

  public override async embed(input: {
    texts: string[];
  }): Promise<{ vectors: number[][] }> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: input.texts,
    });

    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    return { vectors };
  }
}
