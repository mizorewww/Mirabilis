import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  exportStructuredDocumentToMarkdown,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type SourceLine = {
  blockId: string;
  text: string;
};

type CreateRuntimeOptions = {
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type Deferred<Value> = {
  promise: Promise<Value>;
  reject(reason: unknown): void;
  resolve(value: Value): void;
};

type ExecuteSpy = {
  mock: {
    calls: unknown[][];
  };
};

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const commandPaletteName = /^Command Palette$/i;
const quickCaptureName = /^Quick Capture$/i;
const quickCaptureOpenCommandId = "quick-capture.open";
const quickCaptureSaveCommandId = "quick-capture.save";
const quickCaptureSaveAndOpenCommandId = "quick-capture.save-and-open";
const quickCapturePluginId = "quick-capture";
const searchPluginId = "search";
const quickCaptureNamespace = "quick-capture";
const quickCaptureMetadataKey = "unprocessed";
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const task040SurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/gen/schemas",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/db",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
  "CHANGELOG.md",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-040 command palette dialog", () => {
  it("opens from the top bar with focus in command search and restores focus after Escape or Cancel", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();

    registerZeroPayloadCommand(runtime, {
      id: "quick-capture.show-daily-plan",
      title: "Show Daily Plan",
    });
    renderReadyApp(runtime);

    const launcher = await findTopBarButton(/^Command$/i);

    await user.click(launcher);

    const dialog = await screen.findByRole("dialog", {
      name: commandPaletteName,
    });
    const search = within(dialog).getByRole("textbox", {
      name: /command search|search commands/i,
    });

    expect(search).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();

    await user.click(launcher);

    const reopenedDialog = await screen.findByRole("dialog", {
      name: commandPaletteName,
    });

    await user.click(
      within(reopenedDialog).getByRole("button", { name: /cancel|close/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
  });

  it("lists active command DTOs with bounded shortcut and context metadata, filters by typing, and does not run inactive or missing-owner commands", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const activeHandler = vi.fn(async () => ({ ok: true }));
    const inactiveHandler = vi.fn(async () => ({ ok: true }));
    const missingOwnerHandler = vi.fn(async () => ({ ok: true }));

    runtime.commands.register({
      id: "quick-capture.format-selection",
      pluginId: quickCapturePluginId,
      title: "Format Selection",
      defaultShortcut: "Mod+Shift+F",
      context: { surface: "workspace", target: "selection" },
      handler: activeHandler,
    });
    runtime.commands.register({
      id: "quick-capture.archive-current-page",
      pluginId: quickCapturePluginId,
      title: "Archive Current Page",
      defaultShortcut: "Mod+Alt+A",
      context: { surface: "page" },
      handler: activeHandler,
    });
    runtime.commands.register({
      id: "search.inactive-review",
      pluginId: searchPluginId,
      title: "Inactive Review Command",
      defaultShortcut: "Mod+Alt+I",
      context: { surface: "workspace" },
      handler: inactiveHandler,
    });
    runtime.commands.register({
      id: "ghost.export-secrets",
      pluginId: "ghost",
      title: "Export Secret Workspace",
      defaultShortcut: "Mod+Alt+E",
      context: { surface: "filesystem" },
      handler: missingOwnerHandler,
    });
    await deactivatePlugin(runtime, searchPluginId);

    renderReadyApp(runtime);
    const { dialog, search } = await openCommandPalette(user);
    const list = within(dialog).getByRole("list", { name: /commands/i });

    expect(within(list).getByText("Format Selection")).toBeVisible();
    expect(within(list).getByText("Mod+Shift+F")).toBeVisible();
    expect(within(list).getByText(/workspace/i)).toBeVisible();
    expect(within(list).getByText(/selection/i)).toBeVisible();

    expect(
      within(list).queryByRole("button", {
        name: /Inactive Review Command/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByRole("button", {
        name: /Export Secret Workspace/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByText("ghost.export-secrets"),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByText("Export Secret Workspace"),
    ).not.toBeInTheDocument();

    await user.type(search, "format");

    expect(within(list).getByText("Format Selection")).toBeVisible();
    await waitFor(() =>
      expect(
        within(list).queryByText("Archive Current Page"),
      ).not.toBeInTheDocument(),
    );
    expect(inactiveHandler).not.toHaveBeenCalled();
    expect(missingOwnerHandler).not.toHaveBeenCalled();
  });

  it("executes the selected descriptor with its exact raw command id instead of a normalized-looking id", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const rawCommandId = " quick-capture.raw-whitespace-command ";
    const normalizedCommandId = "quick-capture.raw-whitespace-command";
    const rawHandler = vi.fn(async () => ({ ok: "raw" }));
    const normalizedHandler = vi.fn(async () => ({ ok: "normalized" }));
    const execute = vi.spyOn(runtime.commands, "execute");

    runtime.commands.register({
      id: rawCommandId,
      pluginId: quickCapturePluginId,
      title: "Run Raw Whitespace Command",
      handler: rawHandler,
    });
    runtime.commands.register({
      id: normalizedCommandId,
      pluginId: quickCapturePluginId,
      title: "Run Normalized Trap Command",
      handler: normalizedHandler,
    });

    renderReadyApp(runtime);

    const { dialog, search } = await openCommandPalette(user);

    await user.type(search, "Raw Whitespace");
    const [rawCommandRow] = within(dialog).getAllByRole("button", {
      name: /Run Raw Whitespace Command/i,
    });

    if (rawCommandRow === undefined) {
      throw new Error("Expected raw whitespace command row");
    }

    await user.click(rawCommandRow);

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([rawCommandId, {}]),
    );
    expect(rawHandler).toHaveBeenCalledTimes(1);
    expect(normalizedHandler).not.toHaveBeenCalled();
    expect(execute.mock.calls).not.toContainEqual([normalizedCommandId, {}]);
  });

  it("revalidates the selected command owner before executing a stale palette row", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const staleCommandId = "quick-capture.stale-owner-command";
    const staleHandler = vi.fn(async () => ({ ok: true }));

    runtime.commands.register({
      id: staleCommandId,
      pluginId: quickCapturePluginId,
      title: "Stale Owner Command",
      handler: staleHandler,
    });

    renderReadyApp(runtime);

    const { dialog, search } = await openCommandPalette(user);

    await user.type(search, "Stale Owner");
    expect(
      within(dialog).getByRole("button", { name: /Stale Owner Command/i }),
    ).toBeVisible();

    await deactivatePlugin(runtime, quickCapturePluginId);
    await user.click(
      within(dialog).getByRole("button", { name: /Stale Owner Command/i }),
    );

    expect(staleHandler).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: commandPaletteName }),
    ).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /command could not run|command failed|unable to run command/i,
    );
    expectNoSensitiveDomLeak();
  });

  it("executes selected zero-payload commands by Enter and click with exact empty payloads and closes on success", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const keyboardCommandId = "quick-capture.zero-keyboard";
    const clickCommandId = "quick-capture.zero-click";
    const keyboardHandler = vi.fn(async () => ({ ok: "keyboard" }));
    const clickHandler = vi.fn(async () => ({ ok: "click" }));
    const execute = vi.spyOn(runtime.commands, "execute");

    runtime.commands.register({
      id: keyboardCommandId,
      pluginId: quickCapturePluginId,
      title: "Zero Keyboard Command",
      defaultShortcut: "Mod+K",
      handler: keyboardHandler,
    });
    runtime.commands.register({
      id: clickCommandId,
      pluginId: quickCapturePluginId,
      title: "Zero Click Command",
      handler: clickHandler,
    });
    renderReadyApp(runtime);

    let opened = await openCommandPalette(user);

    await user.type(opened.search, "Zero Keyboard");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([keyboardCommandId, {}]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(keyboardHandler).toHaveBeenCalledTimes(1);

    opened = await openCommandPalette(user);

    await user.type(opened.search, "Zero Click");
    await user.click(
      within(opened.dialog).getByRole("button", {
        name: /Zero Click Command/i,
      }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([clickCommandId, {}]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: commandPaletteName }),
      ).not.toBeInTheDocument(),
    );
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("keeps command failures generic, leaves the palette open, and refuses typed free-form command ids", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const payloadCommandId = "quick-capture.requires-payload";
    const execute = vi.spyOn(runtime.commands, "execute");

    runtime.commands.register({
      id: payloadCommandId,
      pluginId: quickCapturePluginId,
      title: "Requires Payload Command",
      context: { requiredInput: "current page" },
      handler(input) {
        expect(input).toStrictEqual({});
        throw createSensitiveError(payloadCommandId);
      },
    });
    renderReadyApp(runtime);

    const { dialog, search } = await openCommandPalette(user);

    await user.type(search, "Requires Payload");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([payloadCommandId, {}]),
    );

    const alert = within(dialog).getByRole("alert");

    expect(alert).toHaveTextContent(
      /command could not run|command failed|unable to run command/i,
    );
    expect(screen.getByRole("dialog", { name: commandPaletteName })).toBeVisible();
    expectNoSensitiveDomLeak();

    const callsBeforeFreeform = execute.mock.calls.length;

    await user.clear(search);
    await user.type(search, "quick-capture.private-command-id");
    await user.keyboard("{Enter}");

    expect(execute.mock.calls).toHaveLength(callsBeforeFreeform);
  });

  it("renders command palette items from copied safe descriptor fields without leaking raw registry or runtime handles", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const descriptorCommandId = "quick-capture.dto-safe-command";
    const execute = vi.spyOn(runtime.commands, "execute");
    const originalList = runtime.commands.list.bind(runtime.commands);

    runtime.commands.register({
      id: descriptorCommandId,
      pluginId: quickCapturePluginId,
      title: "Visible DTO Command",
      defaultShortcut: "Mod+D",
      context: { surface: "workspace" },
      handler: async () => ({ ok: true }),
    });
    vi.spyOn(runtime.commands, "list").mockImplementation((options) =>
      originalList(options).map((descriptor) =>
        descriptor.id === descriptorCommandId
          ? ({
              ...descriptor,
              db: "SELECT * FROM core_pages",
              fs: "/home/aac6fef/private.md",
              handler: vi.fn(),
              nativeBridge: "NativeBridge PRIVATE_DTO_TOKEN",
              pluginHost: "PluginHost PRIVATE_DTO_TOKEN",
              register: vi.fn(),
              registries: "registries PRIVATE_DTO_TOKEN",
              runtime: "runtime PRIVATE_DTO_TOKEN",
              stores: "stores PRIVATE_DTO_TOKEN",
              unregister: vi.fn(),
            } as unknown as ReturnType<typeof originalList>[number])
          : descriptor,
      ),
    );

    renderReadyApp(runtime);

    const { dialog } = await openCommandPalette(user);

    expect(within(dialog).getByText("Visible DTO Command")).toBeVisible();
    expect(within(dialog).getByText("Mod+D")).toBeVisible();
    expect(document.body.textContent ?? "").not.toMatch(
      /PRIVATE_DTO_TOKEN|SELECT\s+\*|core_pages|\/home\/aac6fef|NativeBridge|PluginHost|\bruntime\b|\bstores\b|\bregistries\b|\bhandler\b|\bregister\b|\bunregister\b/i,
    );

    await user.click(
      within(dialog).getByRole("button", { name: /Visible DTO Command/i }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([descriptorCommandId, {}]),
    );
  });
});

describe("TASK-040 Quick Capture dialog", () => {
  it("executes quick-capture.open with exact empty payload before showing the dialog", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const openResult = createDeferred<unknown>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureOpenCommandId) {
          return openResult.promise;
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    await user.click(await findTopBarButton(/^Quick Capture$/i));

    await waitFor(() =>
      expect(execute.mock.calls[0]).toStrictEqual([
        quickCaptureOpenCommandId,
        {},
      ]),
    );
    expect(
      screen.queryByRole("dialog", { name: quickCaptureName }),
    ).not.toBeInTheDocument();

    openResult.resolve({
      kind: "quick-capture.open-result",
      viewId: "quick-capture.modal",
    });

    const dialog = await screen.findByRole("dialog", { name: quickCaptureName });
    const markdown = within(dialog).getByRole("textbox", { name: /markdown/i });

    expect(markdown).toHaveFocus();
  });

  it("refuses to launch when quick-capture.open is registered by another active plugin", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const foreignOpenHandler = vi.fn(async () => ({
      kind: "quick-capture.open-result",
      viewId: "quick-capture.modal",
    }));

    replaceCommandWithForeignOwner(
      runtime,
      quickCaptureOpenCommandId,
      foreignOpenHandler,
    );
    renderReadyApp(runtime);

    await user.click(await findTopBarButton(/^Quick Capture$/i));

    expect(foreignOpenHandler).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /quick capture|capture could not open|unable to open/i,
    );
    expect(
      screen.queryByRole("dialog", { name: quickCaptureName }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("provides a labelled multiline Markdown form, disables blank saves, and closes by Cancel or Escape without saving", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const execute = vi.spyOn(runtime.commands, "execute");

    renderReadyApp(runtime);

    const firstOpen = await openQuickCaptureDialog(user);
    const saveButton = within(firstOpen.dialog).getByRole("button", {
      name: /^Save$/i,
    });
    const saveAndOpenButton = within(firstOpen.dialog).getByRole("button", {
      name: /save and open/i,
    });

    expect(saveButton).toBeDisabled();
    expect(saveAndOpenButton).toBeDisabled();

    await user.type(
      firstOpen.markdown,
      "- [[ ] Cancelled capture{Enter}Second line",
    );

    expect(firstOpen.markdown).toHaveAccessibleName(/markdown/i);
    expect(firstOpen.markdown).toHaveValue("- [ ] Cancelled capture\nSecond line");
    expect(saveButton).toBeEnabled();
    expect(saveAndOpenButton).toBeEnabled();

    await user.click(
      within(firstOpen.dialog).getByRole("button", { name: /cancel/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );
    expect(firstOpen.launcher).toHaveFocus();
    expect(commandWasExecuted(execute, quickCaptureSaveCommandId)).toBe(false);
    expect(commandWasExecuted(execute, quickCaptureSaveAndOpenCommandId)).toBe(
      false,
    );

    const secondOpen = await openQuickCaptureDialog(user);

    await user.type(secondOpen.markdown, "Escape capture");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );
    expect(secondOpen.launcher).toHaveFocus();
    expect(commandWasExecuted(execute, quickCaptureSaveCommandId)).toBe(false);
    expect(commandWasExecuted(execute, quickCaptureSaveAndOpenCommandId)).toBe(
      false,
    );
  });

  it("keeps typed Markdown visible during pending save and prevents duplicate save or save-and-open submits", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const saveResult = createDeferred<unknown>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveCommandId) {
          return saveResult.promise;
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    const { dialog, launcher, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Pending capture");
    await user.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(commandCallCount(execute, quickCaptureSaveCommandId)).toBe(1),
    );
    expect(markdown).toHaveValue("Pending capture");
    expect(
      within(dialog).getByRole("button", { name: /^Save$/i }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: /save and open/i }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("status", { name: /quick capture save|saving/i }),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: /^Save$/i }));
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    expect(commandCallCount(execute, quickCaptureSaveCommandId)).toBe(1);
    expect(commandCallCount(execute, quickCaptureSaveAndOpenCommandId)).toBe(0);

    saveResult.resolve({
      appendedBlockIds: ["pending-block"],
      createdInbox: true,
      kind: "quick-capture.save-result",
      pageId: "pending-inbox",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/Saving Quick Capture/i)).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();

    const reopened = await openQuickCaptureDialog(user);

    expect(reopened.markdown).toHaveValue("");
    expect(
      within(reopened.dialog).queryByRole("status", {
        name: /quick capture save|saving/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(reopened.dialog).getByRole("button", { name: /cancel/i }),
    );
  });

  it("cleans up pending save-and-open state, closes the dialog, navigates, and restores focus after success", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "pending-open-inbox"],
    });
    const user = userEvent.setup();
    const saveAndOpenResult = createDeferred<unknown>();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveAndOpenCommandId) {
          return saveAndOpenResult.promise;
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();
    createRuntimePage(runtime, "Inbox", [
      {
        blockId: "pending-open-body",
        text: "Pending save and open body",
      },
    ]);

    const { dialog, launcher, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Pending save and open");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    await waitFor(() =>
      expect(commandCallCount(execute, quickCaptureSaveAndOpenCommandId)).toBe(
        1,
      ),
    );
    expect(markdown).toHaveValue("Pending save and open");
    expect(
      within(dialog).getByRole("button", { name: /save and open/i }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("status", { name: /quick capture save|saving/i }),
    ).toBeVisible();

    saveAndOpenResult.resolve({
      appendedBlockIds: ["pending-open-body"],
      createdInbox: false,
      kind: "quick-capture.save-result",
      openPageId: "pending-open-inbox",
      pageId: "pending-open-inbox",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/Saving Quick Capture/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^Inbox Workspace$/i }),
    ).toBeVisible();
    expect(launcher).toHaveFocus();

    const reopened = await openQuickCaptureDialog(user);

    expect(reopened.markdown).toHaveValue("");
    await user.click(
      within(reopened.dialog).getByRole("button", { name: /cancel/i }),
    );
  });

  it("refuses to save when quick-capture.save is registered by another active plugin", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const foreignSaveHandler = vi.fn(async () => ({
      appendedBlockIds: ["foreign-save"],
      createdInbox: true,
      kind: "quick-capture.save-result",
      pageId: "foreign-save-inbox",
    }));

    renderReadyApp(runtime);

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    replaceCommandWithForeignOwner(
      runtime,
      quickCaptureSaveCommandId,
      foreignSaveHandler,
    );

    await user.type(markdown, "Foreign-owned save must stay local");
    await user.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    expect(foreignSaveHandler).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: quickCaptureName }),
    ).toBeVisible();
    expect(markdown).toHaveValue("Foreign-owned save must stay local");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("refuses to save and open when quick-capture.save-and-open is registered by another active plugin", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "foreign-open-target"],
    });
    const user = userEvent.setup();
    const foreignSaveAndOpenHandler = vi.fn(async () => ({
      appendedBlockIds: ["foreign-open-target-body"],
      createdInbox: false,
      kind: "quick-capture.save-result",
      openPageId: "foreign-open-target",
      pageId: "foreign-open-target",
    }));

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();
    createRuntimePage(runtime, "Foreign Target", [
      {
        blockId: "foreign-open-target-body",
        text: "Foreign-owned command target",
      },
    ]);

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    replaceCommandWithForeignOwner(
      runtime,
      quickCaptureSaveAndOpenCommandId,
      foreignSaveAndOpenHandler,
    );

    await user.type(markdown, "Foreign-owned save and open must not route");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    expect(foreignSaveAndOpenHandler).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: quickCaptureName }),
    ).toBeVisible();
    expect(markdown).toHaveValue("Foreign-owned save and open must not route");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        hidden: true,
        name: /^Foreign Target Workspace$/i,
      }),
    ).not.toBeInTheDocument();
    expectNoSensitiveDomLeak();
  });

  it("saves through quick-capture.save with exact Markdown payload and preserves trusted Inbox semantics", async () => {
    const runtime = await createRuntime({
      metadataIds: ["metadata-1"],
      pageIds: ["user-inbox", "home-page", "trusted-inbox"],
    });
    const user = userEvent.setup();
    const execute = vi.spyOn(runtime.commands, "execute");
    const userInbox = createRuntimePage(runtime, "Inbox", [
      {
        blockId: "user-inbox-body",
        text: "User-owned Inbox body",
      },
    ]);

    renderReadyApp(runtime);

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Trusted Quick Capture body #inbox");
    await user.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveCommandId,
        { markdown: "Trusted Quick Capture body #inbox" },
      ]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: quickCaptureName }),
      ).not.toBeInTheDocument(),
    );

    const trustedInbox = runtime.pages.get("trusted-inbox");

    expect(runtime.pages.get(userInbox.id)).toStrictEqual(userInbox);
    expect(runtime.metadata.list({ pageId: userInbox.id })).toStrictEqual([]);
    expect(trustedInbox).toMatchObject({
      id: "trusted-inbox",
      title: "Inbox",
    });
    expect(
      exportStructuredDocumentToMarkdown(trustedInbox.body),
    ).toContain("Trusted Quick Capture body #inbox");
    expect(
      runtime.metadata.get(
        "trusted-inbox",
        quickCaptureNamespace,
        quickCaptureMetadataKey,
      ),
    ).toMatchObject({
      pageId: "trusted-inbox",
      sourcePluginId: quickCapturePluginId,
      value: true,
    });
  });

  it("save and open navigates to the returned page id through the normal workspace route without rendering command-output bodies", async () => {
    const runtime = await createRuntime({
      metadataIds: ["metadata-1"],
      pageIds: ["home-page", "open-inbox"],
    });
    const user = userEvent.setup();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation(async (commandId, input) => {
        const result = await originalExecute(commandId, input);

        if (commandId === quickCaptureSaveAndOpenCommandId) {
          return {
            ...(result as Record<string, unknown>),
            body: "COMMAND_OUTPUT_PRIVATE_BODY",
            error: createSensitiveError(quickCaptureSaveAndOpenCommandId),
            markdown: "COMMAND_OUTPUT_PRIVATE_MARKDOWN",
          };
        }

        return result;
      });

    renderReadyApp(runtime);

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Open from trusted page store");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveAndOpenCommandId,
        { markdown: "Open from trusted page store" },
      ]),
    );

    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    expect(
      screen.getByRole("heading", { name: /^Inbox Workspace$/i }),
    ).toBeVisible();
    expect(editor).toHaveValue("Open from trusted page store");
    expect(document.body.textContent ?? "").not.toMatch(
      /COMMAND_OUTPUT_PRIVATE_BODY|COMMAND_OUTPUT_PRIVATE_MARKDOWN|SELECT\s+\*|core_pages|\/home\/aac6fef|Bearer|SECRET/i,
    );
  });

  it("keeps save-and-open command rejections generic without changing route or clearing typed Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveAndOpenCommandId) {
          return Promise.reject(createSensitiveError(commandId));
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Rejected save and open");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveAndOpenCommandId,
        { markdown: "Rejected save and open" },
      ]),
    );
    expect(
      screen.getByRole("dialog", { name: quickCaptureName }),
    ).toBeVisible();
    expect(markdown).toHaveValue("Rejected save and open");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("keeps malformed save-and-open results generic without changing route or clearing typed Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveAndOpenCommandId) {
          return Promise.resolve({
            kind: "quick-capture.save-result",
          });
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Malformed save and open result");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveAndOpenCommandId,
        { markdown: "Malformed save and open result" },
      ]),
    );
    expect(
      screen.getByRole("dialog", { name: quickCaptureName }),
    ).toBeVisible();
    expect(markdown).toHaveValue("Malformed save and open result");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("keeps unknown save-and-open page ids generic without changing route or clearing typed Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveAndOpenCommandId) {
          return Promise.resolve({
            appendedBlockIds: ["missing-open-page-body"],
            createdInbox: false,
            kind: "quick-capture.save-result",
            openPageId: "missing-open-page",
            pageId: "missing-open-page",
          });
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    expect(
      await screen.findByRole("heading", { name: /^Home Workspace$/i }),
    ).toBeVisible();

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Unknown returned page");
    await user.click(
      within(dialog).getByRole("button", { name: /save and open/i }),
    );

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveAndOpenCommandId,
        { markdown: "Unknown returned page" },
      ]),
    );
    expect(
      screen.getByRole("dialog", { name: quickCaptureName }),
    ).toBeVisible();
    expect(markdown).toHaveValue("Unknown returned page");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expect(
      screen.getByRole("heading", {
        hidden: true,
        name: /^Home Workspace$/i,
      }),
    ).toBeVisible();
    expectNoSensitiveDomLeak();
  });

  it("redacts Quick Capture open failures without showing a dialog", async () => {
    const openRuntime = await createRuntime();
    const user = userEvent.setup();
    const openOriginalExecute = openRuntime.commands.execute.bind(
      openRuntime.commands,
    );
    const openExecute = vi
      .spyOn(openRuntime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureOpenCommandId) {
          return Promise.reject(createSensitiveError(commandId));
        }

        return openOriginalExecute(commandId, input);
      });

    renderReadyApp(openRuntime);

    const openLauncher = await findTopBarButton(/^Quick Capture$/i);

    await user.click(openLauncher);

    await waitFor(() =>
      expect(openExecute.mock.calls).toContainEqual([
        quickCaptureOpenCommandId,
        {},
      ]),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /quick capture|capture could not open|unable to open/i,
    );
    expect(
      screen.queryByRole("dialog", { name: quickCaptureName }),
    ).not.toBeInTheDocument();
    expectNoSensitiveDomLeak();
  });

  it("keeps Quick Capture save failures generic and preserves typed Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const originalExecute = runtime.commands.execute.bind(runtime.commands);
    const execute = vi
      .spyOn(runtime.commands, "execute")
      .mockImplementation((commandId, input) => {
        if (commandId === quickCaptureSaveCommandId) {
          return Promise.reject(createSensitiveError(commandId));
        }

        return originalExecute(commandId, input);
      });

    renderReadyApp(runtime);

    const { dialog, markdown } = await openQuickCaptureDialog(user);

    await user.type(markdown, "Keep this after failure");
    await user.click(within(dialog).getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(execute.mock.calls).toContainEqual([
        quickCaptureSaveCommandId,
        { markdown: "Keep this after failure" },
      ]),
    );

    expect(screen.getByRole("dialog", { name: quickCaptureName })).toBeVisible();
    expect(markdown).toHaveValue("Keep this after failure");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /capture could not save|save failed|unable to save/i,
    );
    expectNoSensitiveDomLeak();
  });
});

describe("TASK-040 static dialog boundaries", () => {
  it("keeps package, lockfile, Tauri, Rust, IPC, capability, permission, schema, filesystem, opener, shortcut, notification, and release surfaces unchanged", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listTask040SurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
  });

  it("keeps App Shell out of Quick Capture private imports and raw native/runtime modules", async () => {
    const appShellFiles = await listExistingSourceFiles(appShellEntrypoints);
    const violations: string[] = [];

    for (const filePath of appShellFiles) {
      const source = await readFile(filePath, "utf8");
      const relativePath = toRepoRelativePath(filePath);

      for (const moduleSpecifier of collectStaticModuleSpecifiers(source)) {
        const resolvedModule = resolveModuleSpecifier(filePath, moduleSpecifier);
        const violation = findForbiddenTask040AppShellImport(resolvedModule);

        if (violation !== undefined) {
          violations.push(`${relativePath} -> ${moduleSpecifier}: ${violation}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("uses current MUI and Testing Library APIs for the TASK-040 shell slice", async () => {
    const productionSources = await readSourceFilesIfExists(
      path.join(repoRoot, "src"),
    );
    const violations = productionSources.flatMap((sourceFile) => [
      ...findForbiddenMuiImportPatterns(sourceFile),
      ...findRemovedMuiPropPatterns(sourceFile),
      ...findForbiddenTestingApiPatterns(sourceFile),
    ]);

    expect(violations).toStrictEqual([]);
  });
});

function renderReadyApp(runtime: AppRuntime): RenderResult {
  return render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createMetadataId =
    options.metadataIds === undefined
      ? undefined
      : createSequenceFactory(options.metadataIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined && createMetadataId === undefined
      ? {}
      : {
          createStores: (): CoreStores =>
            createCoreStores({
              ...(createPageId === undefined
                ? {}
                : {
                    pages: {
                      createId: createPageId,
                    },
                  }),
              ...(createMetadataId === undefined
                ? {}
                : {
                    metadata: {
                      createId: createMetadataId,
                    },
                  }),
            }),
        }),
  });
}

function registerZeroPayloadCommand(
  runtime: AppRuntime,
  {
    id,
    title,
  }: {
    id: string;
    title: string;
  },
): void {
  runtime.commands.register({
    id,
    pluginId: quickCapturePluginId,
    title,
    handler: async () => ({ ok: true }),
  });
}

async function openCommandPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await findTopBarButton(/^Command$/i));

  const dialog = await screen.findByRole("dialog", {
    name: commandPaletteName,
  });
  const search = within(dialog).getByRole("textbox", {
    name: /command search|search commands/i,
  });

  await waitFor(() => expect(search).toHaveFocus());

  return { dialog, search };
}

async function openQuickCaptureDialog(user: ReturnType<typeof userEvent.setup>) {
  const launcher = await findTopBarButton(/^Quick Capture$/i);

  await user.click(launcher);

  const dialog = await screen.findByRole("dialog", { name: quickCaptureName });
  const markdown = within(dialog).getByRole("textbox", { name: /markdown/i });

  await waitFor(() => expect(markdown).toHaveFocus());

  return { dialog, launcher, markdown };
}

async function findTopBarButton(name: RegExp): Promise<HTMLElement> {
  const banner = await screen.findByRole("banner", { name: /mirabilis/i });

  return within(banner).findByRole("button", { name });
}

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(
  lines: readonly SourceLine[],
): StructuredMarkdownDocument {
  return {
    content: lines.map((line) => ({
      blockId: line.blockId,
      text: line.text,
      type: "markdown.line",
    }) satisfies BlockNode),
    type: "doc",
  };
}

function commandWasExecuted(execute: ExecuteSpy, commandId: string): boolean {
  return execute.mock.calls.some((call) => call[0] === commandId);
}

function commandCallCount(execute: ExecuteSpy, commandId: string): number {
  return execute.mock.calls.filter((call) => call[0] === commandId).length;
}

function replaceCommandWithForeignOwner(
  runtime: AppRuntime,
  commandId: string,
  handler: (input: unknown) => unknown | Promise<unknown>,
): void {
  try {
    runtime.commands.unregister(commandId);
  } catch {
    // The replacement path is only used in tests that need a foreign descriptor.
  }

  runtime.commands.register({
    id: commandId,
    pluginId: searchPluginId,
    title: `Foreign ${commandId}`,
    handler,
  });
}

async function deactivatePlugin(
  runtime: AppRuntime,
  pluginId: string,
): Promise<void> {
  const host = runtime.pluginHost as AppRuntime["pluginHost"] & {
    deactivate?(pluginId: string): Promise<unknown>;
  };

  if (host.deactivate === undefined) {
    throw new Error("Expected test runtime PluginHost to support deactivation");
  }

  await host.deactivate(pluginId);
}

function createDeferred<Value>(): Deferred<Value> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createSensitiveError(commandId: string): Error {
  const error = new Error(
    [
      commandId,
      "SELECT * FROM core_pages WHERE token='SECRET'",
      "/home/aac6fef/Mirabilis/private/inbox.md",
      "Bearer FAKE_SECRET_TOKEN",
      "PRIVATE_PAGE_BODY_TOKEN",
    ].join(" "),
  );

  error.stack = [
    `Error: ${commandId} SECRET`,
    "    at handler (/home/aac6fef/Mirabilis/src/plugins/private.ts:12:4)",
  ].join("\n");

  return error;
}

function expectNoSensitiveDomLeak(): void {
  expect(document.body.textContent ?? "").not.toMatch(
    /SELECT\s+\*|core_pages|\/home\/aac6fef|Bearer|FAKE_SECRET|SECRET|PRIVATE_PAGE_BODY_TOKEN|stack|at\s+\S+:\d+:\d+|quick-capture\.(?:open|save|save-and-open|requires-payload)|NativeBridge|PluginHost/i,
  );
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error("No test id remains");
    }

    index += 1;

    return value;
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
    files: {
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

async function listTask040SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task040SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task040SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

async function listExistingSourceFiles(
  relativePaths: readonly string[],
): Promise<string[]> {
  const fileGroups = await Promise.all(
    relativePaths.map((relativePath) =>
      listSourceFilesIfExists(path.join(repoRoot, relativePath)),
    ),
  );

  return fileGroups.flat().sort();
}

async function listSourceFilesIfExists(absolutePath: string): Promise<string[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      listSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function readSourceFilesIfExists(
  absolutePath: string,
): Promise<SourceFile[]> {
  const entry = await statIfExists(absolutePath);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(absolutePath))
      ? [
          {
            filePath: toRepoRelativePath(absolutePath),
            source: await readFile(absolutePath, "utf8"),
          },
        ]
      : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const childEntries = await readdir(absolutePath, { withFileTypes: true });
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      readSourceFilesIfExists(path.join(absolutePath, childEntry.name)),
    ),
  );

  return childFiles.flat();
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

function collectStaticModuleSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const commonJsRequirePattern = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of contents.matchAll(importExportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(sideEffectImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(dynamicImportPattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  for (const match of contents.matchAll(commonJsRequirePattern)) {
    const moduleSpecifier = match[1];

    if (moduleSpecifier !== undefined) {
      specifiers.push(moduleSpecifier);
    }
  }

  return [...new Set(specifiers)].sort();
}

function resolveModuleSpecifier(
  importerPath: string,
  moduleSpecifier: string,
): string {
  if (!moduleSpecifier.startsWith(".")) {
    return moduleSpecifier.replace(/\\/gu, "/");
  }

  return path
    .relative(repoRoot, path.resolve(path.dirname(importerPath), moduleSpecifier))
    .replace(/\\/gu, "/");
}

function findForbiddenTask040AppShellImport(
  resolvedModule: string,
): string | undefined {
  const normalized = resolvedModule.toLowerCase();

  if (
    /(?:^|\/)plugins\/quick-capture(?:$|\/|\.ts|\.tsx)/u.test(normalized)
  ) {
    return "Quick Capture private plugin import";
  }

  if (
    /@tauri-apps|(?:^|\/)core\/native(?:$|\/)|(?:^|\/)core\/plugin-host(?:$|\/)|(?:^|\/)core\/stores(?:$|\/)|(?:^|\/)core\/registries(?:$|\/)/u.test(
      normalized,
    )
  ) {
    return "raw native/runtime owner import";
  }

  return undefined;
}

function findForbiddenMuiImportPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (
      moduleSpecifier === "@mui/material" ||
      moduleSpecifier === "@mui/icons-material"
    ) {
      violations.push(`${sourceFile.filePath}: MUI barrel import`);
    }
  }

  return violations;
}

function findRemovedMuiPropPatterns(sourceFile: SourceFile): string[] {
  if (/^src\/test\//u.test(sourceFile.filePath)) {
    return [];
  }

  const patterns = new Map<RegExp, string>([
    [/<ListItem\b[^>]*\bbutton(?:\s|=|>|\{)/u, "ListItem button prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bBackdropProps\s*=/u, "BackdropProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bPaperProps\s*=/u, "PaperProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionComponent\s*=/u, "TransitionComponent prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bTransitionProps\s*=/u, "TransitionProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponents\s*=/u, "components prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bcomponentsProps\s*=/u, "componentsProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputProps\s*=/u, "InputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\binputProps\s*=/u, "inputProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bSelectProps\s*=/u, "SelectProps prop"],
    [/<[A-Z][\w.:-]*\b[^>]*\bInputLabelProps\s*=/u, "InputLabelProps prop"],
    [
      /<[A-Z][\w.:-]*\b[^>]*\bFormHelperTextProps\s*=/u,
      "FormHelperTextProps prop",
    ],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(sourceFile.source))
    .map(([, description]) => `${sourceFile.filePath}: ${description}`);
}

function findForbiddenTestingApiPatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const lowLevelEventName = "fire" + "Event";
  const reactDomTestUtilsSpecifier = ["react-dom", "test-utils"].join("/");

  for (const moduleSpecifier of collectStaticModuleSpecifiers(sourceFile.source)) {
    if (moduleSpecifier === reactDomTestUtilsSpecifier) {
      violations.push(`${sourceFile.filePath}: react-dom test utilities import`);
    }
  }

  const testingPatterns = new Map<RegExp, string>([
    [
      new RegExp(
        `import\\s+\\{[^}]*\\b${lowLevelEventName}\\b[^}]*\\}\\s+from\\s+["']@testing-library/react["']`,
        "u",
      ),
      "Testing Library low-level event import",
    ],
    [
      new RegExp(`\\b${lowLevelEventName}\\.`, "u"),
      "Testing Library low-level event usage",
    ],
    [/\bjest\./u, "Jest global usage"],
    [/\b(?:describe|it|test)\.(?:only|skip)\s*\(/u, "focused or skipped test"],
    [/\bdelay\s*:\s*null\b/u, "user-event delay null"],
  ]);

  for (const [pattern, description] of testingPatterns) {
    if (pattern.test(sourceFile.source)) {
      violations.push(`${sourceFile.filePath}: ${description}`);
    }
  }

  return violations;
}

function toRepoRelativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/gu, "/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
