import "./plugin";
import type {
  AiModelProvider,
  AiProviderBoundaryRequest,
} from "./providers/modelProvider";

type AiProviderSettings = {
  apiKey: string;
  model: string;
  providerId: "openai";
};

type AiPluginTestSupportHooks = {
  configureProvider(provider: AiModelProvider | null): () => void;
  configureSettings(settings: AiProviderSettings | null): () => void;
};

const aiTestSupportKey = Symbol.for("mirabilis.ai.test-support");

export function configureAiPluginForTests(options: {
  provider?: AiModelProvider;
  settings?: AiProviderSettings | null;
}): () => void {
  assertAiPluginTestMode();

  const hooks = readAiPluginTestSupportHooks();
  const resetProvider =
    options.provider === undefined
      ? hooks.configureProvider(null)
      : hooks.configureProvider(wrapAiProviderForTests(options.provider));
  const resetSettings =
    options.settings === undefined
      ? () => undefined
      : hooks.configureSettings(options.settings);

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

function readAiPluginTestSupportHooks(): AiPluginTestSupportHooks {
  const hooks = (globalThis as Record<symbol, unknown>)[aiTestSupportKey];

  if (
    typeof hooks !== "object" ||
    hooks === null ||
    typeof (hooks as Partial<AiPluginTestSupportHooks>).configureProvider !==
      "function" ||
    typeof (hooks as Partial<AiPluginTestSupportHooks>).configureSettings !==
      "function"
  ) {
    throw new Error("AI plugin test support is unavailable");
  }

  return hooks as AiPluginTestSupportHooks;
}

function wrapAiProviderForTests(provider: AiModelProvider): AiModelProvider {
  return {
    async generate(request) {
      const wrappedRequest: AiProviderBoundaryRequest = {
        operation: request.operation,
        providerId: request.providerId,
        request: request.request,
      };

      return provider.generate(wrappedRequest);
    },
    id: provider.id,
  };
}
