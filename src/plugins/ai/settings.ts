export type AiProviderSettings = {
  apiKey: string;
  model: string;
  providerId: "openai";
};

export const aiProviderId = "openai";
export const defaultOpenAiModel = "gpt-5.5";

let configuredSettings: AiProviderSettings | null = null;

export function getAiProviderSettings(): AiProviderSettings | null {
  if (configuredSettings === null) {
    return null;
  }

  return {
    apiKey: configuredSettings.apiKey,
    model: configuredSettings.model,
    providerId: configuredSettings.providerId,
  };
}

export function setAiProviderSettingsForTests(
  settings: AiProviderSettings | null,
): () => void {
  const previous = configuredSettings;

  configuredSettings =
    settings === null
      ? null
      : {
          apiKey: settings.apiKey,
          model: settings.model,
          providerId: settings.providerId,
        };

  return () => {
    configuredSettings = previous;
  };
}
