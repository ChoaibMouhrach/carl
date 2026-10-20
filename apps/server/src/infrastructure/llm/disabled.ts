import { BadRequestError } from "@server/lib/errors";
import {
  BaseLlm,
  type StructuredRequest,
  type StructuredResult,
} from "@server/lib/base-llm";

interface DisabledLlmInit {
  model: string;
  provider: string;
}

export class DisabledLlm extends BaseLlm {
  public readonly configured = false;
  public readonly model: string;
  public readonly provider: string;

  public constructor(init: DisabledLlmInit) {
    super();

    this.model = init.model;
    this.provider = init.provider;
  }

  public override async generateStructured<Output>(
    _request: StructuredRequest<Output>,
  ): Promise<StructuredResult<Output>> {
    throw new BadRequestError({
      message: "The AI filter is not set up. Add OPENAI_API_KEY to the server.",
    });
  }
}
