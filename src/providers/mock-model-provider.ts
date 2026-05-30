import type { ModelProvider, ModelRequest, ModelResponse } from "../types.js";

export class MockModelProvider implements ModelProvider {
  readonly mode = "mock";
  readonly name = "deterministic-mock";

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return {
      content: `Mock model response for ${request.purpose}.\n\n${request.prompt}`,
      model: this.name
    };
  }
}

