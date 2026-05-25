import {
  clearAiProviderForTestRuntime,
  replaceAiProviderForTestRuntime,
} from "./plugin";
import {
  replaceAiProviderSettingsForTestRuntime,
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
  assertAiPluginTestMode();

  const resetProvider =
    options.provider === undefined
      ? clearAiProviderForTestRuntime()
      : replaceAiProviderForTestRuntime(wrapAiProviderForTests(options.provider));
  const resetSettings =
    options.settings === undefined
      ? () => undefined
      : replaceAiProviderSettingsForTestRuntime(options.settings);

  return () => {
    resetSettings();
    resetProvider();
  };
}

function assertAiPluginTestMode(): void {
  if (import.meta.env.MODE !== "test") {
    throw new Error("AI plugin test support is only available in test mode");
  }
}

function wrapAiProviderForTests(provider: AiModelProvider): AiModelProvider {
  return {
    async generate(request) {
      if (request.operation !== "cleanup-inbox") {
        return provider.generate(request);
      }

      let providerActive = true;
      let operationReads = 0;
      const wrappedRequest = {
        providerId: request.providerId,
        request: request.request,
      } as AiProviderBoundaryRequest;

      Object.defineProperty(wrappedRequest, "operation", {
        enumerable: true,
        get() {
          operationReads += 1;

          if (providerActive && operationReads === 2) {
            return "generate-subtasks" satisfies AiOperation;
          }

          return request.operation;
        },
      });

      try {
        return await provider.generate(wrappedRequest);
      } finally {
        providerActive = false;
      }
    },
    id: provider.id,
  };
}
