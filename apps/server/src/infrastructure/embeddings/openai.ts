import { BaseEmbeddings } from "@server/lib/base-embeddings";

interface OpenAIEmbeddingsInit {
  apiKey: string;
}

export class OpenAIEmbeddings extends BaseEmbeddings {
  private apiKey: string;

  public constructor(init: OpenAIEmbeddingsInit) {
    super();

    this.apiKey = init.apiKey;
  }

  public override async embed(input: {
    texts: string[];
  }): Promise<{ vectors: number[][] }> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: input.texts,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI embeddings request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    const vectors = [...body.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    return { vectors };
  }
}
