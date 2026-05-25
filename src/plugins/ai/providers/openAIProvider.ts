import type { AiModelProvider, AiProviderBoundaryRequest } from "./modelProvider";

export type OpenAiTransport = {
  generate(request: AiProviderBoundaryRequest): Promise<unknown>;
};

export function createOpenAIProvider(
  transport: OpenAiTransport | null = null,
): AiModelProvider {
  return {
    async generate(request) {
      if (transport === null) {
        throw new Error("AI provider unavailable");
      }

      return transport.generate(request);
    },
    id: "openai",
  };
}
