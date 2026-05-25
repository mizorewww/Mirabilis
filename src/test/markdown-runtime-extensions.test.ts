import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import type {
  AppPlugin,
  DbQuery,
  MarkdownSyntaxContribution,
  NativeBridge,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type CollectedMarkdownSyntaxContribution = MarkdownSyntaxContribution & {
  pluginId: string;
};

type RuntimeWithMarkdownFacade = AppRuntime & {
  markdown?: {
    collectEditorExtensions(): readonly CollectedMarkdownSyntaxContribution[];
  };
};

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const nativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];
const task017AllowedNativeImplementationFiles = new Set([
  "src-tauri/src/commands/db.rs",
]);
const forbiddenTask017AllowedNativeDiffPatterns = new Map<RegExp, string>([
  [/^\+\s*#\s*\[\s*tauri::command\b/m, "added Tauri command attribute"],
]);

describe("Markdown runtime extension collection", () => {
  it("collects inert markdown syntax descriptors from loaded plugin manifests", async () => {
    const taskSyntax = {
      id: "task.markdown.checkbox",
      name: "Task checkbox syntax",
      description: "Recognizes task checkbox text for the Task Plugin later.",
      syntax: "- [ ]",
    } satisfies MarkdownSyntaxContribution;
    const tagSyntax = {
      id: "tag.markdown.inline-token",
      name: "Tag token syntax",
      syntax: "#tag",
    } satisfies MarkdownSyntaxContribution;
    const runtime = (await createAppRuntime({
      createNativeBridge: () => createNoopNativeBridge(),
      builtInPlugins: [
        createManifestOnlyPlugin("task", [taskSyntax]),
        createManifestOnlyPlugin("tag", [tagSyntax]),
        createManifestOnlyPlugin("calendar", []),
      ],
    })) as RuntimeWithMarkdownFacade;
    const extensions = runtime.markdown?.collectEditorExtensions() ?? [];

    expect.soft(runtime.markdown?.collectEditorExtensions).toEqual(
      expect.any(Function),
    );
    expect(extensions).toStrictEqual([
      {
        pluginId: "task",
        ...taskSyntax,
      },
      {
        pluginId: "tag",
        ...tagSyntax,
      },
    ]);
    expect(JSON.parse(JSON.stringify(extensions))).toStrictEqual(extensions);
    expect(JSON.stringify(extensions)).not.toMatch(/tiptap|prosemirror/i);

    for (const extension of extensions) {
      for (const value of Object.values(extension)) {
        expect(typeof value).not.toBe("function");
      }
    }
  });

  it("keeps the trusted host-owned pluginId when a manifest contribution tries to spoof it", async () => {
    const rogueTaskSyntax = {
      id: "task.markdown.checkbox",
      name: "Task checkbox syntax",
      syntax: "- [ ]",
      pluginId: "calendar",
    } as MarkdownSyntaxContribution & { pluginId: string };
    const runtime = (await createAppRuntime({
      createNativeBridge: () => createNoopNativeBridge(),
      builtInPlugins: [createManifestOnlyPlugin("task", [rogueTaskSyntax])],
    })) as RuntimeWithMarkdownFacade;

    expect(runtime.markdown?.collectEditorExtensions()).toStrictEqual([
      {
        pluginId: "task",
        id: "task.markdown.checkbox",
        name: "Task checkbox syntax",
        syntax: "- [ ]",
      },
    ]);
  });

  it("does not collect extensions from deactivated plugins", async () => {
    const taskSyntax = {
      id: "task.markdown.checkbox",
      name: "Task checkbox syntax",
      syntax: "- [ ]",
    } satisfies MarkdownSyntaxContribution;
    const runtime = (await createAppRuntime({
      createNativeBridge: () => createNoopNativeBridge(),
      builtInPlugins: [createManifestOnlyPlugin("task", [taskSyntax])],
    })) as RuntimeWithMarkdownFacade;

    await (
      runtime.pluginHost as typeof runtime.pluginHost & {
        deactivate(pluginId: string): Promise<unknown>;
      }
    ).deactivate("task");

    expect(runtime.markdown?.collectEditorExtensions()).toStrictEqual([]);
  });

  it("does not require native command, capability, generated permission, Cargo, or package surface changes except reviewed TASK-017 DB body validation", async () => {
    const changedNativeSurfaceFiles = await listNativeSurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedNativeSurfaceFiles),
    ).toStrictEqual([]);
  });
});

function createManifestOnlyPlugin(
  id: string,
  markdownSyntax: readonly MarkdownSyntaxContribution[],
): AppPlugin {
  return {
    manifest: {
      id,
      name: `${id} plugin`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
      contributes: {
        markdownSyntax,
      },
    },
    register() {
      return undefined;
    },
  };
}

function createNoopNativeBridge(): NativeBridge {
  return {
    db: {
      async execute<Response>(_query: DbQuery): Promise<Response> {
        void _query;

        return undefined as Response;
      },
      async transaction<Response>(
        _queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        void _queries;

        return [] as NativeBridgeTransactionResult<Response>;
      },
    },
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
}

async function listNativeSurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);

  const changedFiles = [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
  const disallowedChanges: string[] = [];

  for (const filePath of changedFiles) {
    if (!task017AllowedNativeImplementationFiles.has(filePath)) {
      disallowedChanges.push(filePath);
      continue;
    }

    const forbiddenAllowedChange =
      await findForbiddenTask017AllowedNativeChange(filePath);

    if (forbiddenAllowedChange !== undefined) {
      disallowedChanges.push(`${filePath}: ${forbiddenAllowedChange}`);
    }
  }

  return disallowedChanges;
}

async function findForbiddenTask017AllowedNativeChange(
  relativePath: string,
): Promise<string | undefined> {
  const diff = await runGitOutput([
    "diff",
    "--unified=0",
    "master",
    "--",
    relativePath,
  ]);

  for (const [pattern, description] of forbiddenTask017AllowedNativeDiffPatterns) {
    if (pattern.test(diff)) {
      return description;
    }
  }

  return undefined;
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const stdout = await runGitOutput(args);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
  });

  return stdout;
}
