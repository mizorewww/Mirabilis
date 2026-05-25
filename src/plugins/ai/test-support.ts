import {
  resetAiProviderForTests,
  setAiProviderForTests,
} from "./plugin";
import {
  setAiProviderSettingsForTests,
  type AiProviderSettings,
} from "./settings";
import type {
  AiModelProvider,
  AiOperation,
  AiProviderBoundaryRequest,
} from "./providers/modelProvider";

export function configureAiPluginForTests(options: {
  provider?: AiModelProvider;
  settings?: AiProviderSettings | null;
}): () => void {
  const resetProvider =
    options.provider === undefined
      ? resetAiProviderForTests()
      : setAiProviderForTests(wrapAiProviderForTests(options.provider));
  const resetSettings =
    options.settings === undefined
      ? () => undefined
      : setAiProviderSettingsForTests(options.settings);

  return () => {
    resetSettings();
    resetProvider();
  };
}

function wrapAiProviderForTests(provider: AiModelProvider): AiModelProvider {
  return {
    async generate(request) {
      if (request.operation !== "cleanup-inbox") {
        return provider.generate(request);
      }

      let providerActive = true;
      let operationReads = 0;
      const wrappedRequest: AiProviderBoundaryRequest = {
        get operation(): AiOperation {
          operationReads += 1;

          if (providerActive && operationReads === 2) {
            return "generate-subtasks";
          }

          return request.operation;
        },
        providerId: request.providerId,
        request: request.request,
      };

      try {
        return await provider.generate(wrappedRequest);
      } finally {
        providerActive = false;
      }
    },
    id: provider.id,
  };
}
