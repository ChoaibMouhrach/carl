import type z from "zod";

export interface StructuredRequest<Output> {
  system: string;
  prompt: string;
  /** What the model must answer with; each provider turns it into its own structured output format */
  schema: z.ZodType<Output>;
}

export interface StructuredResult<Output> {
  output: Output;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** One model behind one provider, asked for a structured answer. Swap the provider or SDK by adding a strategy, not by touching callers */
export abstract class BaseLlm {
  public abstract readonly provider: string;
  public abstract readonly model: string;
  /** False for the disabled provider, so callers can refuse before queueing work */
  public abstract readonly configured: boolean;

  public abstract generateStructured<Output>(
    request: StructuredRequest<Output>,
  ): Promise<StructuredResult<Output>>;
}
