import type {
  MarkdownSyntaxContribution,
  PluginManifest,
} from "../plugin-api";
import type { MarkdownPageRuntimeFacade } from "./markdown-pages";

export type CollectedMarkdownSyntaxContribution =
  MarkdownSyntaxContribution & {
    pluginId: string;
  };

export type MarkdownRuntimeFacade = {
  collectEditorExtensions(): readonly CollectedMarkdownSyntaxContribution[];
  pages?: MarkdownPageRuntimeFacade;
};

type MarkdownExtensionManifestProvider = {
  listPlugins?(): readonly {
    enabled?: boolean;
    status?: string;
    manifest: Pick<PluginManifest, "id" | "contributes">;
  }[];
};

type MarkdownRuntimeFacadeOptions = {
  pages?: MarkdownPageRuntimeFacade;
};

export function createMarkdownRuntimeFacade(
  provider: MarkdownExtensionManifestProvider,
  options: MarkdownRuntimeFacadeOptions = {},
): MarkdownRuntimeFacade {
  const facade: MarkdownRuntimeFacade = {
    collectEditorExtensions() {
      return collectMarkdownSyntaxContributions(provider);
    },
  };

  if (options.pages !== undefined) {
    facade.pages = options.pages;
  }

  return facade;
}

function collectMarkdownSyntaxContributions(
  provider: MarkdownExtensionManifestProvider,
): readonly CollectedMarkdownSyntaxContribution[] {
  const plugins = provider.listPlugins?.() ?? [];

  return plugins.flatMap((plugin) =>
    shouldCollectPluginExtensions(plugin)
      ? (plugin.manifest.contributes?.markdownSyntax ?? []).map(
          (contribution) => ({
            ...contribution,
            pluginId: plugin.manifest.id,
          }),
        )
      : [],
  );
}

function shouldCollectPluginExtensions(plugin: {
  enabled?: boolean;
  status?: string;
}): boolean {
  if (plugin.status !== undefined) {
    return plugin.status === "active";
  }

  if (plugin.enabled !== undefined) {
    return plugin.enabled;
  }

  return true;
}
