import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppPlugin,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
} from "../core";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type MetadataBarProps = {
  pageId: string;
  metadata: readonly MetadataRecord[];
  slots: AppRuntime["registries"]["slots"];
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
  pluginHost?: Pick<AppRuntime["pluginHost"], "listPlugins">;
};

type MetadataUiModule = {
  MetadataBar?: ComponentType<MetadataBarProps>;
  MetadataUiPlugin?: AppPlugin;
};

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  metadataIds?: readonly string[];
  builtInPlugins?: readonly AppPlugin[];
};

type CapturedFieldProps = Record<string, unknown>;

const metadataUiPluginId = "metadata-ui";
const taskPluginId = "task";
const tagPluginId = "tag";
const timerPluginId = "timer";
const pageHeaderMetadataSlot = "page.header.metadata";
const tagAddCommandId = "tag.add-tag";
const tagRemoveCommandId = "tag.remove-tag";
const metadataUiModulePath = "../plugins/metadata-ui";
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

describe("Metadata UI Plugin", () => {
  it("is a built-in plugin and exposes the unified metadata bar component", async () => {
    const metadataUi = await loadMetadataUiModule();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );

    expect(metadataUi.MetadataBar).toEqual(expect.any(Function));
    expect(metadataUi.MetadataUiPlugin?.manifest.id).toBe(metadataUiPluginId);
    expect(builtInPluginIds).toContain(metadataUiPluginId);
  });

  it("renders page.header.metadata fields in deterministic slot order with stable default-order ties", async () => {
    const FieldDefaultFirst = createStaticMetadataField("Default field first");
    const FieldExplicitZero = createStaticMetadataField("Explicit zero field");
    const FieldDefaultSecond = createStaticMetadataField("Default field second");
    const runtime = await createRuntime({
      pageIds: ["ordered-page"],
      metadataIds: ["ordered-tags"],
      builtInPlugins: [
        ...BUILT_IN_PLUGINS,
        metadataFieldPlugin({
          pluginId: "alpha",
          slotId: "alpha.page-header-metadata.default-first",
          fieldKey: "first",
          component: FieldDefaultFirst,
        }),
        metadataFieldPlugin({
          pluginId: "beta",
          slotId: "beta.page-header-metadata.explicit-zero",
          fieldKey: "second",
          order: 0,
          component: FieldExplicitZero,
        }),
        metadataFieldPlugin({
          pluginId: "gamma",
          slotId: "gamma.page-header-metadata.default-second",
          fieldKey: "third",
          component: FieldDefaultSecond,
        }),
      ],
    });
    const page = createPage(runtime, "Ordered metadata page");

    setMetadata(runtime, page.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["architecture"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(await createMetadataBar(runtime, page.id));

    const bar = screen.getByRole("region", { name: /page metadata/i });
    const orderedText = bar.textContent ?? "";

    expect(orderedText.indexOf("Default field first")).toBeLessThan(
      orderedText.indexOf("Explicit zero field"),
    );
    expect(orderedText.indexOf("Explicit zero field")).toBeLessThan(
      orderedText.indexOf("Default field second"),
    );
    expect(orderedText.indexOf("Default field second")).toBeLessThan(
      orderedText.indexOf("#architecture"),
    );
    expect(
      runtime.registries.slots
        .list({ slot: pageHeaderMetadataSlot })
        .find((slot) => slot.id === "tag.page-header-metadata.tags"),
    ).toMatchObject({
      pluginId: tagPluginId,
      order: 300,
    });
  });

  it("preserves Tag field display, editing, feedback, and wrong-page result rejection inside the unified bar", async () => {
    const runtime = await createRuntime({
      pageIds: ["tag-bar-page"],
      metadataIds: ["tag-bar-tags"],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Tag metadata bar");
    const execute = vi.fn(
      async (commandId: string, input?: unknown): Promise<unknown> => {
        if (commandId === tagAddCommandId) {
          if (
            isRecord(input) &&
            input.pageId === page.id &&
            input.tag === "product"
          ) {
            return {
              pageId: page.id,
              tags: [
                "architecture",
                "<img src=x onerror=alert(1)>",
                "product",
              ],
            };
          }

          if (
            isRecord(input) &&
            input.pageId === page.id &&
            input.tag === "mismatched"
          ) {
            return {
              pageId: "other-page",
              tags: ["mismatched"],
            };
          }
        }

        if (commandId === tagRemoveCommandId) {
          if (
            isRecord(input) &&
            input.pageId === page.id &&
            input.tag === "architecture"
          ) {
            return {
              pageId: page.id,
              tags: ["<img src=x onerror=alert(1)>", "product"],
            };
          }

          if (
            isRecord(input) &&
            input.pageId === page.id &&
            input.tag === "product"
          ) {
            return {
              pageId: "other-page",
              tags: ["mismatched-remove"],
            };
          }
        }

        throw new Error(`Unexpected metadata command ${commandId}`);
      },
    );

    setMetadata(runtime, page.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["architecture", "<img src=x onerror=alert(1)>"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(await createMetadataBar(runtime, page.id, { commands: { execute } }));

    expect(screen.getByRole("region", { name: /page metadata/i })).toBeVisible();
    expect(screen.getByText("#architecture")).toBeVisible();
    expect(screen.getByText("#<img src=x onerror=alert(1)>")).toBeVisible();
    expectNoDangerousDom();

    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expectVisibleTagFeedback());
    expect(execute).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: /^tag$/i }), "product");
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expect(screen.getByText("#product")).toBeVisible());
    expect(execute).toHaveBeenNthCalledWith(1, tagAddCommandId, {
      pageId: page.id,
      tag: "product",
    });

    await user.click(
      screen.getByRole("button", { name: /remove #architecture/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText("#architecture")).not.toBeInTheDocument(),
    );
    expect(execute).toHaveBeenNthCalledWith(2, tagRemoveCommandId, {
      pageId: page.id,
      tag: "architecture",
    });

    await user.type(
      screen.getByRole("textbox", { name: /^tag$/i }),
      "mismatched",
    );
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expectVisibleTagFeedback());
    expect(screen.queryByText("#mismatched")).not.toBeInTheDocument();
    expect(execute).toHaveBeenNthCalledWith(3, tagAddCommandId, {
      pageId: page.id,
      tag: "mismatched",
    });

    await user.click(screen.getByRole("button", { name: /remove #product/i }));

    await waitFor(() => expectVisibleTagFeedback());
    expect(screen.getByText("#product")).toBeVisible();
    expect(screen.queryByText("#mismatched-remove")).not.toBeInTheDocument();
    expect(execute).toHaveBeenNthCalledWith(4, tagRemoveCommandId, {
      pageId: page.id,
      tag: "product",
    });
    expectNoDangerousDom();
  });

  it("updates real runtime Tag metadata through the unified bar command boundary", async () => {
    const runtime = await createRuntime({
      pageIds: ["runtime-tag-bar-page"],
      metadataIds: ["runtime-tag-bar-tags"],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Runtime tag metadata bar");

    setMetadata(runtime, page.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["architecture"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(await createMetadataBar(runtime, page.id));

    await user.type(screen.getByRole("textbox", { name: /^tag$/i }), "runtime");
    await user.click(screen.getByRole("button", { name: /^add tag$/i }));

    await waitFor(() => expect(screen.getByText("#runtime")).toBeVisible());
    expectTagMetadata(runtime, page.id, ["architecture", "runtime"]);

    await user.click(
      screen.getByRole("button", { name: /remove #architecture/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText("#architecture")).not.toBeInTheDocument(),
    );
    expectTagMetadata(runtime, page.id, ["runtime"]);
  });

  it("blocks a metadata slot contribution from executing another plugin's command", async () => {
    const ForeignCommandProbe = (props: CapturedFieldProps) => {
      const [outcome, setOutcome] = useState("Foreign command idle");

      return (
        <section aria-label="Foreign command probe">
          <button
            type="button"
            onClick={() => {
              const commands = readCommandExecutor(props.commands);

              if (commands === null) {
                setOutcome("Foreign command blocked");
                return;
              }

              void commands
                .execute(tagAddCommandId, {
                  pageId: props.pageId,
                  tag: "escape",
                })
                .then(
                  () => setOutcome("Foreign command escaped"),
                  () => setOutcome("Foreign command blocked"),
                );
            }}
          >
            Try foreign command
          </button>
          <span>{outcome}</span>
        </section>
      );
    };
    const runtime = await createRuntime({
      pageIds: ["foreign-command-page"],
      builtInPlugins: [
        ...BUILT_IN_PLUGINS,
        metadataFieldPlugin({
          pluginId: "review",
          slotId: "review.page-header-metadata.escalation",
          fieldKey: "score",
          component: ForeignCommandProbe,
        }),
      ],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Foreign command page");
    const execute = vi.fn(async (): Promise<unknown> => ({
      pageId: page.id,
      tags: ["escape"],
    }));

    render(await createMetadataBar(runtime, page.id, { commands: { execute } }));

    await user.click(
      screen.getByRole("button", { name: /try foreign command/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Foreign command blocked")).toBeVisible(),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps repeated Tag editors label-associated when multiple metadata bars render", async () => {
    const runtime = await createRuntime({
      pageIds: ["first-tag-page", "second-tag-page"],
      metadataIds: ["first-tag-record", "second-tag-record"],
    });
    const user = userEvent.setup();
    const firstPage = createPage(runtime, "First tag page");
    const secondPage = createPage(runtime, "Second tag page");
    const execute = vi.fn(async (): Promise<unknown> => ({
      pageId: "unused",
      tags: [],
    }));

    setMetadata(runtime, firstPage.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["first"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    setMetadata(runtime, secondPage.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["second"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(
      <>
        {await createMetadataBar(runtime, firstPage.id, { commands: { execute } })}
        {await createMetadataBar(runtime, secondPage.id, {
          commands: { execute },
        })}
      </>,
    );
    const tagEditors = screen.getAllByRole("textbox", { name: /^tag$/i });
    const [firstEditor, secondEditor] = tagEditors as [
      HTMLInputElement,
      HTMLInputElement,
    ];

    expect(tagEditors).toHaveLength(2);
    expect(firstEditor).not.toBe(secondEditor);

    await user.type(firstEditor, "alpha");
    await user.type(secondEditor, "beta");

    expect(firstEditor).toHaveValue("alpha");
    expect(secondEditor).toHaveValue("beta");
  });

  it("renders Task current fields read-only and Timer placeholder controls inertly from plugin-owned contributions", async () => {
    const runtime = await createRuntime({
      pageIds: ["task-metadata-page"],
      metadataIds: [
        "task-enabled",
        "task-status",
        "task-source-page",
        "task-source-block",
        "task-scheduled",
        "task-due",
      ],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Task metadata page");
    const execute = vi.fn(async (): Promise<unknown> => {
      throw new Error("Metadata field should not execute a timer command");
    });

    setTaskMetadata(runtime, page.id, {
      enabled: true,
      status: "todo",
      sourcePageId: "source-page",
      sourceBlockId: "source-block",
      scheduled: "2026-05-21",
      due: "2026-05-22",
    });
    render(await createMetadataBar(runtime, page.id, { commands: { execute } }));

    expectTaskHeaderContributions(runtime);
    expectTimerPlaceholderContribution(runtime);

    const taskGroup = screen.getByRole("group", { name: /task metadata/i });
    expect(within(taskGroup).getByText(/todo/i)).toBeVisible();
    expect(within(taskGroup).getByText(/enabled/i)).toBeVisible();
    expect(within(taskGroup).getByText(/^true$/i)).toBeVisible();
    expect(within(taskGroup).getByText(/source page/i)).toBeVisible();
    expect(within(taskGroup).getByText(/source-page/i)).toBeVisible();
    expect(within(taskGroup).getByText(/source block/i)).toBeVisible();
    expect(within(taskGroup).getByText(/source-block/i)).toBeVisible();
    expect(within(taskGroup).getByText(/scheduled/i)).toBeVisible();
    expect(within(taskGroup).getByText(/2026-05-21/i)).toBeVisible();
    expect(within(taskGroup).getByText(/due/i)).toBeVisible();
    expect(within(taskGroup).getByText(/2026-05-22/i)).toBeVisible();
    expect(screen.queryByText(/estimate/i)).not.toBeInTheDocument();
    expect(within(taskGroup).queryByRole("button")).not.toBeInTheDocument();
    expect(within(taskGroup).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(taskGroup).queryByRole("combobox")).not.toBeInTheDocument();

    const timerGroup = screen.getByRole("group", { name: /timer metadata/i });
    const startTimer = within(timerGroup).getByRole("button", {
      name: /start timer/i,
    });

    expect(startTimer).toBeDisabled();
    await user.click(startTimer);
    expect(execute).not.toHaveBeenCalled();
    expect(
      runtime.registries.commands
        .list({ pluginId: timerPluginId })
        .map((command) => command.id),
    ).toStrictEqual([]);
  });

  it("renders unsafe metadata values as inert text without links, images, scripts, or executable attributes", async () => {
    const runtime = await createRuntime({
      pageIds: ["unsafe-metadata-page"],
      metadataIds: [
        "unsafe-task-status",
        "unsafe-task-scheduled",
        "unsafe-task-due",
        "unsafe-tag-tags",
      ],
    });
    const page = createPage(runtime, "Unsafe metadata page");

    setMetadata(runtime, page.id, {
      namespace: taskPluginId,
      key: "status",
      value: "<script>alert(1)</script>",
      valueType: "string",
      sourcePluginId: taskPluginId,
    });
    setMetadata(runtime, page.id, {
      namespace: taskPluginId,
      key: "scheduled",
      value: "data:text/html,<img src=x onerror=alert(1)>",
      valueType: "date",
      sourcePluginId: taskPluginId,
    });
    setMetadata(runtime, page.id, {
      namespace: taskPluginId,
      key: "due",
      value: "[x](javascript:alert(1))",
      valueType: "date",
      sourcePluginId: taskPluginId,
    });
    setMetadata(runtime, page.id, {
      namespace: tagPluginId,
      key: "tags",
      value: [
        "<img src=x onerror=alert(1)>",
        "[x](javascript:alert(1))",
      ],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(await createMetadataBar(runtime, page.id));

    expect(screen.getByText("#<img src=x onerror=alert(1)>")).toBeVisible();
    expect(screen.getByText("#[x](javascript:alert(1))")).toBeVisible();
    expectNoDangerousDom();
  });

  it("fails closed when plugin host ownership cannot be verified", async () => {
    const capturedProps: CapturedFieldProps[] = [];
    const HostlessProbe = (props: CapturedFieldProps) => {
      capturedProps.push(props);

      return <span>Hostless trusted metadata field</span>;
    };
    const runtime = await createRuntime({
      pageIds: ["hostless-metadata-page"],
      metadataIds: ["hostless-review-score"],
      builtInPlugins: [
        metadataFieldPlugin({
          pluginId: "review",
          slotId: "review.page-header-metadata.hostless-score",
          fieldKey: "score",
          component: HostlessProbe,
        }),
      ],
    });
    const MetadataBar = await loadMetadataBar();
    const page = createPage(runtime, "Hostless metadata page");

    setMetadata(runtime, page.id, {
      namespace: "review",
      key: "score",
      value: "trusted",
      valueType: "string",
      sourcePluginId: "review",
    });
    render(
      <MetadataBar
        pageId={page.id}
        metadata={runtime.metadata.list({ pageId: page.id })}
        slots={runtime.registries.slots}
        commands={runtime.commands}
      />,
    );

    expect(
      screen.queryByText("Hostless trusted metadata field"),
    ).not.toBeInTheDocument();
    expect(capturedProps).toStrictEqual([]);
  });

  it("passes narrow field props without raw runtime handles or unrelated plugin metadata", async () => {
    const capturedProps: CapturedFieldProps[] = [];
    const ProbeField = (props: CapturedFieldProps) => {
      capturedProps.push(props);

      return <span>Review metadata field</span>;
    };
    const runtime = await createRuntime({
      pageIds: ["prop-boundary-page"],
      metadataIds: ["review-score", "other-secret"],
      builtInPlugins: [
        ...BUILT_IN_PLUGINS,
        metadataFieldPlugin({
          pluginId: "review",
          slotId: "review.page-header-metadata.score",
          fieldKey: "score",
          component: ProbeField,
        }),
      ],
    });
    const page = createPage(runtime, "Prop boundary page");

    setMetadata(runtime, page.id, {
      namespace: "review",
      key: "score",
      value: "ready",
      valueType: "string",
      sourcePluginId: "review",
    });
    setMetadata(runtime, page.id, {
      namespace: "other",
      key: "secret",
      value: "other-secret-value",
      valueType: "string",
      sourcePluginId: "other",
    });
    render(await createMetadataBar(runtime, page.id));

    expect(screen.getByText("Review metadata field")).toBeVisible();
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]?.pageId).toBe(page.id);
    expect(collectUnsafePropPaths(capturedProps[0] ?? {})).toStrictEqual([]);
    expect(containsDeepValue(capturedProps[0], "other-secret-value")).toBe(false);
  });

  it("ignores malformed metadataFields declarations without crashing or trusting values", async () => {
    const capturedProps: CapturedFieldProps[] = [];
    const MalformedProbe = (props: CapturedFieldProps) => {
      capturedProps.push(props);
      const values = readCapturedValues(props);
      const fieldKeys = readCapturedFieldKeys(props);

      return (
        <span>
          {fieldKeys.length === 0 &&
          Object.keys(values).length === 0 &&
          !containsDeepValue(props, "malformed-visible")
            ? "Malformed metadata ignored"
            : "Malformed metadata trusted"}
        </span>
      );
    };
    const runtime = await createRuntime({
      pageIds: ["malformed-fields-page"],
      metadataIds: ["malformed-array-status", "malformed-non-array-status"],
      builtInPlugins: [
        metadataFieldsProbePlugin({
          pluginId: "malformed-array",
          slotId: "malformed-array.page-header-metadata.status",
          metadataFields: [
            null,
            "status",
            42,
            {
              id: "malformed-array.incomplete",
              namespace: "malformed-array",
            },
          ],
          component: MalformedProbe,
        }),
        metadataFieldsProbePlugin({
          pluginId: "malformed-non-array",
          slotId: "malformed-non-array.page-header-metadata.status",
          metadataFields: {
            id: "malformed-non-array.status",
            namespace: "malformed-non-array",
            key: "status",
            valueType: "string",
          },
          component: MalformedProbe,
        }),
      ],
    });
    const page = createPage(runtime, "Malformed fields page");

    setMetadata(runtime, page.id, {
      namespace: "malformed-array",
      key: "status",
      value: "malformed-visible",
      valueType: "string",
      sourcePluginId: "malformed-array",
    });
    setMetadata(runtime, page.id, {
      namespace: "malformed-non-array",
      key: "status",
      value: "malformed-visible",
      valueType: "string",
      sourcePluginId: "malformed-non-array",
    });
    render(await createMetadataBar(runtime, page.id));

    expect(screen.getAllByText("Malformed metadata ignored")).toHaveLength(2);
    expect(capturedProps).toHaveLength(2);
    for (const props of capturedProps) {
      expect(readCapturedFieldKeys(props)).toStrictEqual([]);
      expect(Object.keys(readCapturedValues(props))).toStrictEqual([]);
    }
  });

  it("rejects unsafe metadata field segments and keeps trusted values prototype-safe", async () => {
    const capturedProps: CapturedFieldProps[] = [];
    const UnsafeSegmentProbe = (props: CapturedFieldProps) => {
      capturedProps.push(props);
      const values = readCapturedValues(props);
      const prototype = Object.getPrototypeOf(values);
      const prototypePolluted =
        isRecord(prototype) && prototype.polluted === "yes";
      const constructorTrusted = Object.entries(values).some(
        ([key, value]) => key === "constructor" && value === "constructor-visible",
      );

      return (
        <section aria-label="Unsafe segment probe">
          {values.safe === "safe-visible" ? (
            <span>Safe metadata visible</span>
          ) : null}
          {prototypePolluted ||
          constructorTrusted ||
          readCapturedFieldKeys(props).some((key) =>
            ["__proto__", "constructor"].includes(key),
          ) ? (
            <span>Unsafe metadata trusted</span>
          ) : null}
        </section>
      );
    };
    const UnsafeNamespaceProbe = (props: CapturedFieldProps) => {
      capturedProps.push(props);
      const values = readCapturedValues(props);
      const fieldTrusted = readCapturedFieldKeys(props).includes("status");

      return (
        <section aria-label="Unsafe namespace probe">
          {fieldTrusted || values.status === "namespace-visible" ? (
            <span>Unsafe namespace trusted</span>
          ) : null}
        </section>
      );
    };
    const runtime = await createRuntime({
      pageIds: ["unsafe-segment-page"],
      metadataIds: [
        "unsafe-proto-record",
        "unsafe-constructor-record",
        "safe-segment-record",
        "unsafe-namespace-record",
      ],
      builtInPlugins: [
        metadataFieldsProbePlugin({
          pluginId: "pollution",
          slotId: "pollution.page-header-metadata.unsafe",
          metadataFields: [
            {
              id: "pollution.__proto__",
              namespace: "pollution",
              key: "__proto__",
              valueType: "json",
            },
            {
              id: "pollution.constructor",
              namespace: "pollution",
              key: "constructor",
              valueType: "string",
            },
            {
              id: "pollution.safe",
              namespace: "pollution",
              key: "safe",
              valueType: "string",
            },
          ],
          component: UnsafeSegmentProbe,
        }),
        metadataFieldsProbePlugin({
          pluginId: "__proto__",
          slotId: "unsafe-namespace.page-header-metadata.status",
          metadataFields: [
            {
              id: "__proto__.status",
              namespace: "__proto__",
              key: "status",
              valueType: "string",
            },
          ],
          component: UnsafeNamespaceProbe,
        }),
      ],
    });
    const page = createPage(runtime, "Unsafe segment page");

    setMetadata(runtime, page.id, {
      namespace: "pollution",
      key: "__proto__",
      value: { polluted: "yes" },
      valueType: "json",
      sourcePluginId: "pollution",
    });
    setMetadata(runtime, page.id, {
      namespace: "pollution",
      key: "constructor",
      value: "constructor-visible",
      valueType: "string",
      sourcePluginId: "pollution",
    });
    setMetadata(runtime, page.id, {
      namespace: "pollution",
      key: "safe",
      value: "safe-visible",
      valueType: "string",
      sourcePluginId: "pollution",
    });
    setMetadata(runtime, page.id, {
      namespace: "__proto__",
      key: "status",
      value: "namespace-visible",
      valueType: "string",
      sourcePluginId: "__proto__",
    });
    render(await createMetadataBar(runtime, page.id));

    expect(screen.getByText("Safe metadata visible")).toBeVisible();
    expect(screen.queryByText("Unsafe metadata trusted")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Unsafe namespace trusted"),
    ).not.toBeInTheDocument();
    expect(capturedProps).toHaveLength(2);
    expect(readCapturedFieldKeys(capturedProps[0] ?? {})).toStrictEqual(["safe"]);
    expect(readCapturedValues(capturedProps[0] ?? {})).toMatchObject({
      safe: "safe-visible",
    });
    expect(readCapturedValues(capturedProps[0] ?? {})).not.toHaveProperty(
      "constructor",
      "constructor-visible",
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        readCapturedValues(capturedProps[0] ?? {}),
        "__proto__",
      ),
    ).toBe(false);
  });

  it("ignores corrupt owner-looking metadata whose stored valueType does not match the descriptor", async () => {
    const capturedProps: CapturedFieldProps[] = [];
    const CorruptOwnerProbe = (props: CapturedFieldProps) => {
      capturedProps.push(props);
      const values = readCapturedValues(props);

      return (
        <span>
          {values.status === undefined
            ? "Corrupt owner metadata ignored"
            : "Corrupt owner metadata trusted"}
        </span>
      );
    };
    const runtime = await createRuntime({
      pageIds: ["corrupt-owner-page"],
      metadataIds: ["corrupt-review-status"],
      builtInPlugins: [
        metadataFieldsProbePlugin({
          pluginId: "review",
          slotId: "review.page-header-metadata.corrupt-status",
          metadataFields: [
            {
              id: "review.status",
              namespace: "review",
              key: "status",
              valueType: "string",
            },
          ],
          component: CorruptOwnerProbe,
        }),
      ],
    });
    const page = createPage(runtime, "Corrupt owner page");

    setMetadata(runtime, page.id, {
      namespace: "review",
      key: "status",
      value: ["done"],
      valueType: "json",
      sourcePluginId: "review",
    });
    render(await createMetadataBar(runtime, page.id));

    expect(screen.getByText("Corrupt owner metadata ignored")).toBeVisible();
    expect(capturedProps).toHaveLength(1);
    expect(readCapturedValues(capturedProps[0] ?? {})).not.toHaveProperty(
      "status",
    );
  });

  it("does not render forged owner metadata as trusted Task-owned fields", async () => {
    const runtime = await createRuntime({
      pageIds: ["forged-owner-page"],
      metadataIds: ["forged-task-status", "trusted-tags"],
    });
    const page = createPage(runtime, "Forged owner page");
    const execute = vi.fn(async (): Promise<unknown> => ({
      pageId: page.id,
      tags: ["safe"],
    }));

    setMetadata(runtime, page.id, {
      namespace: taskPluginId,
      key: "status",
      value: "done",
      valueType: "string",
      sourcePluginId: tagPluginId,
    });
    setMetadata(runtime, page.id, {
      namespace: tagPluginId,
      key: "tags",
      value: ["safe"],
      valueType: "json",
      sourcePluginId: tagPluginId,
    });
    render(await createMetadataBar(runtime, page.id, { commands: { execute } }));

    expect(screen.getByText("#safe")).toBeVisible();
    expect(screen.queryByText(/\bdone\b/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /task metadata/i }),
    ).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not require native, Tauri, package, Cargo, permission, or command-surface changes", async () => {
    expect(await listNativeSurfaceChangesFromMaster()).toStrictEqual([]);
  });
});

async function loadMetadataUiModule(): Promise<MetadataUiModule> {
  try {
    return (await import(
      /* @vite-ignore */ metadataUiModulePath
    )) as MetadataUiModule;
  } catch (error) {
    const missingModuleError = new Error(
      "TASK-023 requires src/plugins/metadata-ui to export MetadataBar and MetadataUiPlugin.",
    );

    Object.defineProperty(missingModuleError, "cause", {
      configurable: true,
      enumerable: false,
      value: error,
      writable: true,
    });

    throw missingModuleError;
  }
}

async function loadMetadataBar(): Promise<ComponentType<MetadataBarProps>> {
  const metadataUi = await loadMetadataUiModule();

  if (typeof metadataUi.MetadataBar !== "function") {
    throw new Error(
      "TASK-023 requires src/plugins/metadata-ui to export a MetadataBar component.",
    );
  }

  return metadataUi.MetadataBar;
}

async function createMetadataBar(
  runtime: AppRuntime,
  pageId: string,
  props: Partial<MetadataBarProps> = {},
) {
  const MetadataBar = await loadMetadataBar();

  return (
    <MetadataBar
      pageId={pageId}
      metadata={runtime.metadata.list({ pageId })}
      slots={runtime.registries.slots}
      commands={props.commands ?? runtime.commands}
      pluginHost={props.pluginHost ?? runtime.pluginHost}
    />
  );
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
    builtInPlugins: options.builtInPlugins,
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

function metadataFieldPlugin(input: {
  pluginId: string;
  slotId: string;
  fieldKey: string;
  order?: number;
  component: ComponentType<CapturedFieldProps>;
}): AppPlugin {
  return {
    manifest: {
      id: input.pluginId,
      name: `${input.pluginId} metadata field`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
      contributes: {
        metadataFields: [
          {
            id: `${input.pluginId}.${input.fieldKey}`,
            namespace: input.pluginId,
            key: input.fieldKey,
            valueType: "string",
          },
        ],
      },
    },
    register(ctx) {
      ctx.slots.register({
        id: input.slotId,
        slot: pageHeaderMetadataSlot,
        ...(input.order === undefined ? {} : { order: input.order }),
        component: input.component,
      });
    },
  };
}

function metadataFieldsProbePlugin(input: {
  pluginId: string;
  slotId: string;
  metadataFields: unknown;
  order?: number;
  component: ComponentType<CapturedFieldProps>;
}): AppPlugin {
  const contributes = {
    metadataFields: input.metadataFields,
  } as unknown as NonNullable<AppPlugin["manifest"]["contributes"]>;

  return {
    manifest: {
      id: input.pluginId,
      name: `${input.pluginId} metadata field`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
      contributes,
    },
    register(ctx) {
      ctx.slots.register({
        id: input.slotId,
        slot: pageHeaderMetadataSlot,
        ...(input.order === undefined ? {} : { order: input.order }),
        component: input.component,
      });
    },
  };
}

function createStaticMetadataField(label: string): ComponentType<CapturedFieldProps> {
  function StaticMetadataField() {
    return <span>{label}</span>;
  }

  StaticMetadataField.displayName = `${label.replace(/\s+/gu, "")}Field`;

  return StaticMetadataField;
}

function createPage(runtime: AppRuntime, title: string): MarkdownPage {
  return runtime.pages.create({
    title,
    body: {
      type: "doc",
      content: [],
    },
  });
}

function setTaskMetadata(
  runtime: AppRuntime,
  pageId: string,
  input: {
    enabled: boolean;
    status: "todo" | "done";
    sourcePageId: string;
    sourceBlockId: string;
    scheduled: string;
    due: string;
  },
): void {
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "enabled",
    value: input.enabled,
    valueType: "boolean",
    sourcePluginId: taskPluginId,
  });
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "status",
    value: input.status,
    valueType: "string",
    sourcePluginId: taskPluginId,
  });
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "sourcePageId",
    value: input.sourcePageId,
    valueType: "string",
    sourcePluginId: taskPluginId,
  });
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "sourceBlockId",
    value: input.sourceBlockId,
    valueType: "string",
    sourcePluginId: taskPluginId,
  });
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "scheduled",
    value: input.scheduled,
    valueType: "date",
    sourcePluginId: taskPluginId,
  });
  setMetadata(runtime, pageId, {
    namespace: taskPluginId,
    key: "due",
    value: input.due,
    valueType: "date",
    sourcePluginId: taskPluginId,
  });
}

function setMetadata(
  runtime: AppRuntime,
  pageId: string,
  input: Omit<Parameters<AppRuntime["metadata"]["set"]>[0], "pageId">,
): void {
  runtime.metadata.set({
    pageId,
    ...input,
  });
}

function expectTaskHeaderContributions(runtime: AppRuntime): void {
  const taskContributions = runtime.registries.slots.list({
    pluginId: taskPluginId,
    slot: pageHeaderMetadataSlot,
  });
  const contributionIds = taskContributions.map((contribution) => contribution.id);

  expect(taskContributions.length).toBeGreaterThan(0);
  expect(contributionIds.join(" ")).not.toMatch(/estimate/iu);
  expect(getTaskManifestFieldKeys()).toStrictEqual([
    "due",
    "enabled",
    "scheduled",
    "sourceBlockId",
    "sourcePageId",
    "status",
  ]);
}

function expectTimerPlaceholderContribution(runtime: AppRuntime): void {
  expect(
    runtime.registries.slots.list({
      pluginId: timerPluginId,
      slot: pageHeaderMetadataSlot,
    }).length,
  ).toBeGreaterThan(0);
}

function expectTagMetadata(
  runtime: AppRuntime,
  pageId: string,
  tags: readonly string[],
): void {
  expect(runtime.metadata.get(pageId, tagPluginId, "tags")).toMatchObject({
    namespace: tagPluginId,
    key: "tags",
    value: tags,
    valueType: "json",
    sourcePluginId: tagPluginId,
  });
}

function getTaskManifestFieldKeys(): string[] {
  const taskPlugin = BUILT_IN_PLUGINS.find(
    (plugin) => plugin.manifest.id === taskPluginId,
  );

  if (taskPlugin === undefined) {
    throw new Error("Missing built-in Task Plugin");
  }

  return [
    ...(taskPlugin.manifest.contributes?.metadataFields?.map(
      (field) => field.key ?? "",
    ) ?? []),
  ].sort();
}

function expectVisibleTagFeedback(): void {
  const feedback = [
    ...screen.queryAllByRole("alert"),
    ...screen.queryAllByRole("status"),
  ].find((element) => /tag/i.test(element.textContent ?? ""));

  expect(feedback).toBeDefined();
  expect(feedback).toBeVisible();
}

function expectNoDangerousDom(): void {
  // Security boundary assertions need direct DOM inspection for executable nodes
  // and dangerous attributes that do not have user-facing roles.
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("script")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("img")).toBeNull();

  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      expect(attribute.name).not.toMatch(/^on/iu);
      expect(attribute.value).not.toMatch(
        /(?:javascript:|data:text\/html|<script\b)/iu,
      );

      if (element instanceof HTMLAnchorElement && attribute.name === "href") {
        throw new Error(`Unexpected metadata link href ${attribute.value}`);
      }
    }
  }
}

function collectUnsafePropPaths(value: unknown): string[] {
  const paths: string[] = [];
  const seen = new WeakSet<object>();
  const unsafeKeys = new Set([
    "database",
    "db",
    "filesystem",
    "files",
    "nativebridge",
    "path",
    "pluginhost",
    "registries",
    "runtime",
    "services",
    "shell",
    "slots",
    "store",
    "stores",
  ]);

  function visit(current: unknown, currentPath: string): void {
    if (typeof current !== "object" || current === null) {
      return;
    }

    if (seen.has(current)) {
      return;
    }

    seen.add(current);

    for (const [key, child] of Object.entries(current)) {
      const childPath = currentPath.length === 0 ? key : `${currentPath}.${key}`;

      if (unsafeKeys.has(key.toLowerCase())) {
        paths.push(childPath);
      }

      visit(child, childPath);
    }
  }

  visit(value, "");

  return paths;
}

function readCapturedFieldKeys(value: CapturedFieldProps): string[] {
  const fields = value.fields;

  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .map((field) => (isRecord(field) ? field.key : undefined))
    .filter((key): key is string => typeof key === "string");
}

function readCapturedValues(
  value: CapturedFieldProps,
): Readonly<Record<string, unknown>> {
  const values = value.values;

  if (!isRecord(values)) {
    return {};
  }

  return values;
}

function readCommandExecutor(value: unknown): MetadataBarProps["commands"] | null {
  if (!isRecord(value) || typeof value.execute !== "function") {
    return null;
  }

  return value as MetadataBarProps["commands"];
}

function containsDeepValue(value: unknown, expected: string): boolean {
  const seen = new WeakSet<object>();

  function visit(current: unknown): boolean {
    if (current === expected) {
      return true;
    }

    if (typeof current !== "object" || current === null) {
      return false;
    }

    if (seen.has(current)) {
      return false;
    }

    seen.add(current);

    return Object.values(current).some((child) => visit(child));
  }

  return visit(value);
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
  return runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
