import type {
  MarkdownSyntaxContribution,
  PluginManifest,
} from "../plugin-api";

export type CollectedMarkdownSyntaxContribution =
  MarkdownSyntaxContribution & {
    pluginId: string;
  };

export type MarkdownRuntimeFacade = {
  collectEditorExtensions(): readonly CollectedMarkdownSyntaxContribution[];
};

type MarkdownExtensionManifestProvider = {
  listPlugins?(): readonly {
    manifest: Pick<PluginManifest, "id" | "contributes">;
  }[];
};

export function createMarkdownRuntimeFacade(
  provider: MarkdownExtensionManifestProvider,
): MarkdownRuntimeFacade {
  return {
    collectEditorExtensions() {
      return collectMarkdownSyntaxContributions(provider);
    },
  };
}

function collectMarkdownSyntaxContributions(
  provider: MarkdownExtensionManifestProvider,
): readonly CollectedMarkdownSyntaxContribution[] {
  const plugins = provider.listPlugins?.() ?? [];

  return plugins.flatMap((plugin) =>
    (plugin.manifest.contributes?.markdownSyntax ?? []).map((contribution) => ({
      pluginId: plugin.manifest.id,
      ...contribution,
    })),
  );
}
