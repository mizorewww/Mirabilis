import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime } from "../bootstrap";
import type {
  AppEvent,
  AppPlugin,
  FilterDefinition,
  MarkdownPage,
  MetadataJsonValue,
  MetadataRecord,
  StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type SyncUnitKind = (typeof expectedSyncUnitKinds)[number];

type SyncUnitDescriptor = {
  conflictPolicy: string;
  durable: boolean;
  kind: SyncUnitKind;
  schemaVersion: 1;
  syncKeyFields: readonly string[];
};

type SyncRebuildableIndexPolicy = {
  durable: false;
  marker: typeof syncRebuildablePluginIndexesMarker;
  reason: string;
  syncable: false;
};

type SyncConflictPolicy = {
  deferred: readonly ["tombstones", "deletes", "conflict-ui"];
  eventUnits: {
    appendOnly: true;
    distinctId: "union";
    identicalDuplicate: "dedupe";
    sameIdDifferentContent: "manual-resolution";
  };
  mutableUnits: {
    divergentEdits: "manual-resolution";
  };
};

type SyncUnitDto = {
  kind: SyncUnitKind;
  schemaVersion: 1;
  snapshot: Record<string, unknown>;
  syncKey: Record<string, string>;
};

type PluginSettingsSnapshot =
  | {
      key: string;
      pluginId: string;
      state: { state: "unset" };
      updatedAt: string;
    }
  | {
      key: string;
      pluginId: string;
      state: { state: "json"; value: MetadataJsonValue };
      updatedAt: string;
    };

type SyncModule = {
  SYNCABLE_UNIT_DESCRIPTORS: readonly SyncUnitDescriptor[];
  SYNC_CONFLICT_POLICY: SyncConflictPolicy;
  SYNC_REBUILDABLE_INDEX_POLICY: SyncRebuildableIndexPolicy;
  SyncPlugin: AppPlugin;
  resolveSyncUnitConflict: (input: unknown) => unknown;
  serializeEventSyncUnit: (event: AppEvent) => SyncUnitDto;
  serializeFilterSyncUnit: (filter: FilterDefinition) => SyncUnitDto;
  serializeMarkdownPageSyncUnit: (page: MarkdownPage) => SyncUnitDto;
  serializeMetadataSyncUnit: (metadata: MetadataRecord) => SyncUnitDto;
  serializePluginSettingsSyncUnit: (
    settings: PluginSettingsSnapshot,
  ) => SyncUnitDto;
};

type RuntimeContributions = NonNullable<AppPlugin["manifest"]["contributes"]>;

const syncPluginId = "sync";
const syncModulePath: string = "../plugins/sync";
const syncUnitMarkdownPage = "sync.unit.markdown-page";
const syncUnitMetadata = "sync.unit.metadata";
const syncUnitEvent = "sync.unit.event";
const syncUnitFilter = "sync.unit.filter";
const syncUnitPluginSettings = "sync.unit.plugin-settings";
const syncRebuildablePluginIndexesMarker = "sync.rebuildable.plugin-indexes";
const syncPluginIndexDurableUnit = "sync.plugin-index";
const schemaVersion = 1;
const expectedSyncUnitKinds = [
  syncUnitMarkdownPage,
  syncUnitMetadata,
  syncUnitEvent,
  syncUnitFilter,
  syncUnitPluginSettings,
] as const;
const expectedSyncKeyFields = {
  [syncUnitMarkdownPage]: ["id"],
  [syncUnitMetadata]: ["pageId", "namespace", "key"],
  [syncUnitEvent]: ["id"],
  [syncUnitFilter]: ["id"],
  [syncUnitPluginSettings]: ["pluginId", "key"],
} as const satisfies Record<SyncUnitKind, readonly string[]>;
const staleSyncIds = [
  "sync-plugin",
  "sync_plugin",
  "core.sync",
  "sync.page",
  "sync.pages",
  "sync.markdown_page",
  "sync.plugin_settings",
  "sync.indexer",
  "sync.indexes",
  "sync.start",
  "sync.push",
  "sync.pull",
  "sync.connect",
  "sync.login",
  "sync.apply",
  "sync.import",
  "sync.configure-remote",
] as const;
const forbiddenPluginSettingsKeys = [
  "apiKey",
  "token",
  "secret",
  "password",
  "endpoint",
  "baseUrl",
  "url",
  "host",
  "server",
  "webhook",
] as const;
const forbiddenNestedPluginSettingsKeys = [
  "api_key",
  "apiKey",
  "accessKey",
  "credential",
  "credentials",
  "auth",
  "authorization",
  "oauth",
  "bearer",
  "endpoint",
  "baseUrl",
  "remoteUrl",
  "url",
  "host",
  "server",
  "webhook",
  "webhookUrl",
] as const;
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
  "src-tauri/gen/schemas",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/db",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
] as const;
const syncProductionEntrypoints = [
  "src/bootstrap/built-in-plugins.ts",
  "src/plugins/sync",
] as const;

describe("Sync Plugin skeleton", () => {
  it("registers Sync as a built-in plugin with no runtime commands, views, settings panels, or stale ids", async () => {
    const runtime = await createAppRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const syncPlugin = BUILT_IN_PLUGINS.find(
      (plugin) => plugin.manifest.id === syncPluginId,
    );

    expect.soft(builtInPluginIds).toEqual(
      expect.arrayContaining([syncPluginId]),
    );
    expect(syncPlugin, "Sync built-in plugin").toBeDefined();

    if (syncPlugin === undefined) {
      throw new Error("Sync built-in plugin is not registered");
    }

    const contributes = syncPlugin.manifest.contributes ?? {};
    const manifestCommandIds = contributionIds(contributes.commands);
    const manifestViewIds = contributionIds(contributes.views);
    const settingsPanelIds = contributionIds(contributes.settingsPanels);
    const runtimeCommandIds = runtime.registries.commands
      .list({ pluginId: syncPluginId })
      .map((command) => command.id)
      .sort();
    const runtimeViewIds = runtime.registries.views
      .list({ pluginId: syncPluginId })
      .map((view) => view.id)
      .sort();

    expect.soft(syncPlugin.manifest).toMatchObject({
      id: syncPluginId,
      name: "Sync Plugin",
    });
    expect.soft(manifestCommandIds).toStrictEqual([]);
    expect.soft(runtimeCommandIds).toStrictEqual([]);
    expect.soft(manifestViewIds).toStrictEqual([]);
    expect.soft(runtimeViewIds).toStrictEqual([]);
    expect.soft(settingsPanelIds).toStrictEqual([]);
    expect.soft(contributionIds(contributes.markdownSyntax)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.metadataFields)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.eventTypes)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.filters)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.slots)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.indexers)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.algorithms)).toStrictEqual([]);
    expect.soft(contributionIds(contributes.mobileToolbarItems)).toStrictEqual(
      [],
    );

    const syncManifestIds = [
      syncPlugin.manifest.id,
      ...manifestCommandIds,
      ...manifestViewIds,
      ...settingsPanelIds,
      ...contributionIds(contributes.metadataFields),
      ...contributionIds(contributes.eventTypes),
      ...contributionIds(contributes.filters),
      ...contributionIds(contributes.indexers),
      ...contributionIds(contributes.algorithms),
    ];

    for (const staleId of staleSyncIds) {
      expect(builtInPluginIds, `${staleId}: built-in plugin id`).not.toContain(
        staleId,
      );
      expect(syncManifestIds, `${staleId}: Sync manifest id`).not.toContain(
        staleId,
      );
      expect(runtimeCommandIds, `${staleId}: runtime command`).not.toContain(
        staleId,
      );
      expect(runtimeViewIds, `${staleId}: runtime view`).not.toContain(staleId);
    }
  });

  it("exports durable syncable unit descriptors and a rebuildable plugin-index policy", async () => {
    const sync = await loadSyncModule();
    const descriptors = sync.SYNCABLE_UNIT_DESCRIPTORS;
    const descriptorKinds = descriptors
      .map((descriptor) => descriptor.kind)
      .sort();

    expect(descriptorKinds).toStrictEqual([...expectedSyncUnitKinds].sort());
    expect(descriptors).toHaveLength(expectedSyncUnitKinds.length);
    expect(sync.SYNC_REBUILDABLE_INDEX_POLICY).toStrictEqual({
      durable: false,
      marker: syncRebuildablePluginIndexesMarker,
      reason: "Local plugin indexes are derived and rebuilt from durable units.",
      syncable: false,
    });
    expect(sync.SYNC_CONFLICT_POLICY).toStrictEqual({
      deferred: ["tombstones", "deletes", "conflict-ui"],
      eventUnits: {
        appendOnly: true,
        distinctId: "union",
        identicalDuplicate: "dedupe",
        sameIdDifferentContent: "manual-resolution",
      },
      mutableUnits: {
        divergentEdits: "manual-resolution",
      },
    });

    for (const kind of expectedSyncUnitKinds) {
      const descriptor = descriptors.find((candidate) => candidate.kind === kind);

      expect(descriptor, `${kind}: descriptor`).toStrictEqual({
        conflictPolicy:
          kind === syncUnitEvent
            ? "event-append-only-union"
            : "mutable-manual-resolution",
        durable: true,
        kind,
        schemaVersion,
        syncKeyFields: expectedSyncKeyFields[kind],
      });
    }

    expect(descriptorKinds).not.toContain(syncPluginIndexDurableUnit);
  });

  it("serializes core syncable units into exact deterministic DTO snapshots", async () => {
    const sync = await loadSyncModule();
    const page = createMarkdownPage();
    const metadata = createMetadataRecord();
    const event = createAppEvent();
    const filter = createFilterDefinition();
    const settings = createPluginSettingsSnapshot({
      state: { state: "json", value: { enabled: true, nested: ["alpha"] } },
    });

    expect(sync.serializeMarkdownPageSyncUnit(page)).toStrictEqual({
      kind: syncUnitMarkdownPage,
      schemaVersion,
      snapshot: {
        archivedAt: "2026-05-25T12:30:00.000Z",
        body: {
          content: [
            {
              attrs: {
                checked: false,
                nested: { labels: ["sync", "contract"] },
              },
              blockId: "block-sync-title",
              text: "# Sync contract",
              type: "markdown.line",
            },
          ],
          type: "doc",
        },
        createdAt: "2026-05-25T10:00:00.000Z",
        id: "page-sync",
        parentPageId: "page-parent",
        title: "Sync contract",
        updatedAt: "2026-05-25T12:00:00.000Z",
      },
      syncKey: { id: "page-sync" },
    });
    expect(sync.serializeMetadataSyncUnit(metadata)).toStrictEqual({
      kind: syncUnitMetadata,
      schemaVersion,
      snapshot: {
        createdAt: "2026-05-25T10:05:00.000Z",
        id: "metadata-sync-status",
        key: "status",
        namespace: "task",
        pageId: "page-sync",
        sourcePluginId: "task",
        updatedAt: "2026-05-25T11:05:00.000Z",
        value: { state: "done", tags: ["sync"] },
        valueType: "json",
      },
      syncKey: {
        key: "status",
        namespace: "task",
        pageId: "page-sync",
      },
    });
    expect(sync.serializeEventSyncUnit(event)).toStrictEqual({
      kind: syncUnitEvent,
      schemaVersion,
      snapshot: {
        createdAt: "2026-05-25T11:00:00.000Z",
        id: "event-sync-created",
        namespace: "task",
        pageId: "page-sync",
        payload: { status: "done", transition: { from: "todo" } },
        sourcePluginId: "task",
        type: "completed",
      },
      syncKey: { id: "event-sync-created" },
    });
    expect(sync.serializeFilterSyncUnit(filter)).toStrictEqual({
      kind: syncUnitFilter,
      schemaVersion,
      snapshot: {
        createdAt: "2026-05-25T09:00:00.000Z",
        group: { field: "metadata.tag.tags" },
        id: "filter-sync-today",
        name: "Sync Today",
        query: {
          where: [
            {
              field: "metadata.task.status",
              op: "eq",
              value: "done",
            },
          ],
        },
        sort: [{ direction: "asc", field: "metadata.task.due" }],
        sourcePluginId: "task",
        updatedAt: "2026-05-25T09:30:00.000Z",
        viewType: "page.list",
      },
      syncKey: { id: "filter-sync-today" },
    });
    expect(sync.serializePluginSettingsSyncUnit(settings)).toStrictEqual({
      kind: syncUnitPluginSettings,
      schemaVersion,
      snapshot: {
        key: "panelState",
        pluginId: "timer",
        state: {
          state: "json",
          value: { enabled: true, nested: ["alpha"] },
        },
        updatedAt: "2026-05-25T12:10:00.000Z",
      },
      syncKey: { key: "panelState", pluginId: "timer" },
    });
  });

  it("returns immutable snapshots and rejects non-JSON runtime or executable data", async () => {
    const sync = await loadSyncModule();
    const page = createMarkdownPage();
    const metadata = createMetadataRecord();
    const event = createAppEvent();
    const filter = createFilterDefinition();
    const settings = createPluginSettingsSnapshot({
      state: { state: "json", value: { enabled: true, nested: ["alpha"] } },
    });

    const pageUnit = sync.serializeMarkdownPageSyncUnit(page);
    const metadataUnit = sync.serializeMetadataSyncUnit(metadata);
    const eventUnit = sync.serializeEventSyncUnit(event);
    const filterUnit = sync.serializeFilterSyncUnit(filter);
    const settingsUnit = sync.serializePluginSettingsSyncUnit(settings);

    page.title = "Mutated page";
    page.body.content[0]!.attrs = { checked: true };
    metadata.value = { state: "mutated" };
    event.payload = { status: "mutated" };
    filter.query.where[0]!.value = "mutated";
    if (settings.state.state === "json") {
      settings.state.value = { enabled: false };
    }

    expect(pageUnit.snapshot.title).toBe("Sync contract");
    expect((pageUnit.snapshot.body as StructuredMarkdownDocument).content[0]).toMatchObject({
      attrs: { checked: false },
    });
    expect(metadataUnit.snapshot.value).toStrictEqual({
      state: "done",
      tags: ["sync"],
    });
    expect(eventUnit.snapshot.payload).toStrictEqual({
      status: "done",
      transition: { from: "todo" },
    });
    expect(filterUnit.snapshot.query).toStrictEqual({
      where: [
        {
          field: "metadata.task.status",
          op: "eq",
          value: "done",
        },
      ],
    });
    expect(settingsUnit.snapshot.state).toStrictEqual({
      state: "json",
      value: { enabled: true, nested: ["alpha"] },
    });

    for (const unsafe of createUnsafeNestedValues()) {
      expect(() =>
        sync.serializeMetadataSyncUnit(
          createMetadataRecord({
            value: { nested: unsafe.value },
            valueType: "json",
          }),
        ),
        unsafe.label,
      ).toThrow(/sync|json|plain|unsafe|cycle|depth/i);
      expect(() =>
        sync.serializeEventSyncUnit(
          createAppEvent({ payload: { nested: unsafe.value } }),
        ),
        unsafe.label,
      ).toThrow(/sync|json|plain|unsafe|cycle|depth/i);
      expect(() =>
        sync.serializeFilterSyncUnit(
          createFilterDefinition({
            query: {
              where: [
                {
                  field: "metadata.task.status",
                  op: "eq",
                  value: { nested: unsafe.value },
                },
              ],
            },
          }),
        ),
        unsafe.label,
      ).toThrow(/sync|json|plain|unsafe|cycle|depth/i);
      expect(() =>
        sync.serializePluginSettingsSyncUnit(
          createPluginSettingsSnapshot({
            state: {
              state: "json",
              value: { nested: unsafe.value } as MetadataJsonValue,
            },
          }),
        ),
        unsafe.label,
      ).toThrow(/sync|json|plain|unsafe|cycle|depth/i);
    }

    const accessorPayload = createAccessorPayload();

    expect(() =>
      sync.serializeMetadataSyncUnit(
        createMetadataRecord({
          value: accessorPayload.value,
          valueType: "json",
        }),
      ),
    ).toThrow(/sync|json|plain|unsafe|accessor/i);
    expect(accessorPayload.readCount()).toBe(0);
  });

  it("rejects unsafe Markdown Page body attrs without invoking getters", async () => {
    const sync = await loadSyncModule();

    for (const unsafe of createUnsafeNestedValues()) {
      expect(() =>
        sync.serializeMarkdownPageSyncUnit(
          createMarkdownPage({
            body: createMarkdownBodyWithAttrs({ nested: unsafe.value }),
          }),
        ),
        unsafe.label,
      ).toThrow(/sync|json|plain|unsafe|cycle|depth/i);
    }

    const accessorPayload = createAccessorPayload();

    expect(() =>
      sync.serializeMarkdownPageSyncUnit(
        createMarkdownPage({
          body: createMarkdownBodyWithAttrs(accessorPayload.value),
        }),
      ),
    ).toThrow(/sync|json|plain|unsafe|accessor/i);
    expect(accessorPayload.readCount()).toBe(0);
  });

  it("preserves valid own __proto__ JSON keys without mutating cloned prototypes", async () => {
    const sync = await loadSyncModule();
    const attrsWithOwnProto = JSON.parse(
      '{"__proto__":{"carried":"sync-data"},"visible":"value"}',
    ) as Record<string, unknown>;

    expect(
      Object.prototype.hasOwnProperty.call(attrsWithOwnProto, "__proto__"),
    ).toBe(true);

    const pageUnit = sync.serializeMarkdownPageSyncUnit(
      createMarkdownPage({
        body: createMarkdownBodyWithAttrs(attrsWithOwnProto),
      }),
    );
    const clonedAttrs = readFirstBlockAttrs(pageUnit);
    const ownProtoDescriptor = Object.getOwnPropertyDescriptor(
      clonedAttrs,
      "__proto__",
    );

    expect(clonedAttrs.visible).toBe("value");
    expect(ownProtoDescriptor).toBeDefined();
    expect(ownProtoDescriptor?.enumerable).toBe(true);
    expect(ownProtoDescriptor?.value).toStrictEqual({ carried: "sync-data" });
    expect(Object.getPrototypeOf(clonedAttrs)).not.toBe(
      ownProtoDescriptor?.value,
    );
    expect(
      (Object.getPrototypeOf(clonedAttrs) as Record<string, unknown> | null)
        ?.carried,
    ).toBeUndefined();
  });

  it("distinguishes unset plugin settings from JSON null and rejects secret or remote endpoint setting keys", async () => {
    const sync = await loadSyncModule();

    expect(
      sync.serializePluginSettingsSyncUnit(
        createPluginSettingsSnapshot({ state: { state: "unset" } }),
      ),
    ).toStrictEqual({
      kind: syncUnitPluginSettings,
      schemaVersion,
      snapshot: {
        key: "panelState",
        pluginId: "timer",
        state: { state: "unset" },
        updatedAt: "2026-05-25T12:10:00.000Z",
      },
      syncKey: { key: "panelState", pluginId: "timer" },
    });
    expect(
      sync.serializePluginSettingsSyncUnit(
        createPluginSettingsSnapshot({ state: { state: "json", value: null } }),
      ),
    ).toStrictEqual({
      kind: syncUnitPluginSettings,
      schemaVersion,
      snapshot: {
        key: "panelState",
        pluginId: "timer",
        state: { state: "json", value: null },
        updatedAt: "2026-05-25T12:10:00.000Z",
      },
      syncKey: { key: "panelState", pluginId: "timer" },
    });

    for (const key of forbiddenPluginSettingsKeys) {
      expect(() =>
        sync.serializePluginSettingsSyncUnit(
          createPluginSettingsSnapshot({
            key,
            state: { state: "json", value: "must-not-sync" },
          }),
        ),
        key,
      ).toThrow(/settings|secret|remote|endpoint|sync/i);
    }
  });

  it("rejects nested plugin settings secrets, credentials, auth, and remote endpoints under neutral keys", async () => {
    const sync = await loadSyncModule();

    for (const key of forbiddenNestedPluginSettingsKeys) {
      expect.soft(
        () =>
          sync.serializePluginSettingsSyncUnit(
            createPluginSettingsSnapshot({
              key: "config",
              state: {
                state: "json",
                value: {
                  preferences: {
                    [key]: "must-not-sync",
                  },
                },
              },
            }),
          ),
        key,
      ).toThrow(/settings|secret|credential|auth|remote|endpoint|durable|sync/i);
    }
  });

  it("applies the structured sync conflict policy for mutable units and append-only events", async () => {
    const sync = await loadSyncModule();
    const basePageUnit = sync.serializeMarkdownPageSyncUnit(createMarkdownPage());
    const localPageUnit = sync.serializeMarkdownPageSyncUnit(
      createMarkdownPage({ title: "Local title" }),
    );
    const remotePageUnit = sync.serializeMarkdownPageSyncUnit(
      createMarkdownPage({ title: "Remote title" }),
    );
    const eventA = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-a", payload: { status: "done" } }),
    );
    const eventB = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-b", payload: { status: "reopened" } }),
    );
    const eventDuplicate = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-a", payload: { status: "done" } }),
    );
    const eventConflict = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-a", payload: { status: "reopened" } }),
    );

    for (const kind of [
      syncUnitMarkdownPage,
      syncUnitMetadata,
      syncUnitFilter,
      syncUnitPluginSettings,
    ] as const) {
      expect(
        sync.resolveSyncUnitConflict({
          base: { ...basePageUnit, kind },
          local: { ...localPageUnit, kind },
          remote: { ...remotePageUnit, kind },
          unitKind: kind,
        }),
        kind,
      ).toStrictEqual({
        outcome: "manual-resolution-required",
        reason: "mutable-unit-divergence",
        unitKind: kind,
      });
    }

    expect(
      sync.resolveSyncUnitConflict({
        local: [eventA],
        remote: [eventB],
        unitKind: syncUnitEvent,
      }),
    ).toStrictEqual({
      conflicts: [],
      outcome: "merged",
      unitKind: syncUnitEvent,
      units: [eventA, eventB],
    });
    expect(
      sync.resolveSyncUnitConflict({
        local: [eventA],
        remote: [eventDuplicate],
        unitKind: syncUnitEvent,
      }),
    ).toStrictEqual({
      conflicts: [],
      outcome: "merged",
      unitKind: syncUnitEvent,
      units: [eventA],
    });
    expect(
      sync.resolveSyncUnitConflict({
        local: [eventA],
        remote: [eventConflict],
        unitKind: syncUnitEvent,
      }),
    ).toStrictEqual({
      conflicts: [
        {
          id: "event-a",
          local: eventA,
          reason: "same-id-different-content",
          remote: eventConflict,
        },
      ],
      outcome: "manual-resolution-required",
      reason: "event-id-content-conflict",
      unitKind: syncUnitEvent,
      units: [],
    });
  });

  it("rejects stale, mismatched, and unsupported event conflict unit kinds inside local or remote arrays", async () => {
    const sync = await loadSyncModule();
    const validEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-valid-kind" }),
    );
    const eventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-invalid-kind" }),
    );

    for (const kind of [
      "sync.page",
      "sync.pages",
      "sync.markdown_page",
      "sync.plugin_settings",
    ] as const) {
      expectEventConflictUnitRejected(sync, {
        label: `stale event unit kind ${kind}`,
        unit: { ...eventUnit, kind },
        validEventUnit,
      });
    }

    for (const kind of [
      syncUnitMarkdownPage,
      syncUnitMetadata,
      syncUnitFilter,
      syncUnitPluginSettings,
    ] as const) {
      expectEventConflictUnitRejected(sync, {
        label: `mismatched event unit kind ${kind}`,
        unit: { ...eventUnit, kind },
        validEventUnit,
      });
    }

    expectEventConflictUnitRejected(sync, {
      label: "unsupported event unit kind",
      unit: { ...eventUnit, kind: "sync.unit.unsupported" },
      validEventUnit,
    });
  });

  it("rejects malformed event conflict units and wrong schema versions inside local or remote arrays", async () => {
    const sync = await loadSyncModule();
    const validEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-valid-shape" }),
    );
    const eventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-invalid-shape" }),
    );

    for (const malformed of [
      {
        label: "schema version 0",
        unit: { ...eventUnit, schemaVersion: 0 },
      },
      {
        label: "schema version 2",
        unit: { ...eventUnit, schemaVersion: 2 },
      },
      {
        label: "string schema version",
        unit: { ...eventUnit, schemaVersion: "1" },
      },
      {
        label: "missing kind",
        unit: {
          schemaVersion,
          snapshot: eventUnit.snapshot,
          syncKey: { id: "event-missing-kind" },
        },
      },
      {
        label: "missing snapshot",
        unit: {
          kind: syncUnitEvent,
          schemaVersion,
          syncKey: { id: "event-missing-snapshot" },
        },
      },
      {
        label: "array snapshot",
        unit: { ...eventUnit, snapshot: [] },
      },
      {
        label: "missing sync key",
        unit: {
          kind: syncUnitEvent,
          schemaVersion,
          snapshot: eventUnit.snapshot,
        },
      },
      {
        label: "non-object unit",
        unit: "event-unit",
      },
    ] as const) {
      expectEventConflictUnitRejected(sync, {
        label: malformed.label,
        unit: malformed.unit,
        validEventUnit,
      });
    }
  });

  it("rejects event conflict units when identity or DTO keys are not exact", async () => {
    const sync = await loadSyncModule();
    const validEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-valid-exact-dto" }),
    );
    const eventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-invalid-exact-dto" }),
    );

    for (const malformed of [
      {
        label: "snapshot id differs from sync key id",
        unit: {
          ...eventUnit,
          snapshot: {
            ...eventUnit.snapshot,
            id: "event-snapshot-different-from-sync-key",
          },
        },
      },
      {
        label: "extra top-level event unit key",
        unit: {
          ...eventUnit,
          mergedFrom: "remote",
        },
      },
      {
        label: "extra event sync key field",
        unit: {
          ...eventUnit,
          syncKey: {
            ...eventUnit.syncKey,
            sourcePluginId: "task",
          },
        },
      },
    ] as const) {
      expectEventConflictUnitRejected(sync, {
        label: malformed.label,
        unit: malformed.unit,
        validEventUnit,
      });
    }
  });

  it("rejects non-plain event conflict units and sync keys even when own DTO keys are exact", async () => {
    const sync = await loadSyncModule();
    const validEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-valid-runtime-shaped-dto" }),
    );
    const eventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-runtime-shaped-dto" }),
    );

    for (const runtimeUnit of createRuntimeShapedEventConflictUnits(eventUnit)) {
      expect(Object.keys(runtimeUnit.unit), runtimeUnit.label).toStrictEqual([
        "kind",
        "schemaVersion",
        "snapshot",
        "syncKey",
      ]);
      expect(Object.getPrototypeOf(runtimeUnit.unit), runtimeUnit.label).not.toBe(
        Object.prototype,
      );
      expectEventConflictUnitRejected(sync, {
        label: runtimeUnit.label,
        unit: runtimeUnit.unit,
        validEventUnit,
      });
    }

    for (const runtimeSyncKey of createRuntimeShapedEventSyncKeys(eventUnit)) {
      const unit = {
        ...eventUnit,
        syncKey: runtimeSyncKey.syncKey,
      };

      expect(
        Object.keys(runtimeSyncKey.syncKey),
        runtimeSyncKey.label,
      ).toStrictEqual(["id"]);
      expect(
        Object.getPrototypeOf(runtimeSyncKey.syncKey),
        runtimeSyncKey.label,
      ).not.toBe(Object.prototype);
      expectEventConflictUnitRejected(sync, {
        label: runtimeSyncKey.label,
        unit,
        validEventUnit,
      });
    }
  });

  it("continues to merge serialized event units with distinct canonical ids", async () => {
    const sync = await loadSyncModule();
    const localEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({
        id: "event-canonical-local",
        payload: { status: "done" },
      }),
    );
    const remoteEventUnit = sync.serializeEventSyncUnit(
      createAppEvent({
        id: "event-canonical-remote",
        payload: { status: "reopened" },
      }),
    );

    expect(
      sync.resolveSyncUnitConflict({
        local: [localEventUnit],
        remote: [remoteEventUnit],
        unitKind: syncUnitEvent,
      }),
    ).toStrictEqual({
      conflicts: [],
      outcome: "merged",
      unitKind: syncUnitEvent,
      units: [localEventUnit, remoteEventUnit],
    });
  });

  it("rejects accessor-backed event conflict unit fields without invoking getters", async () => {
    const sync = await loadSyncModule();

    for (const field of [
      "syncKey",
      "syncKey.id",
      "kind",
      "snapshot",
    ] as const) {
      for (const side of ["local", "remote"] as const) {
        const baseEventUnit = sync.serializeEventSyncUnit(
          createAppEvent({ id: `event-accessor-${field}-${side}` }),
        );
        const validEventUnit = sync.serializeEventSyncUnit(
          createAppEvent({ id: `event-accessor-valid-${field}-${side}` }),
        );
        const accessorUnit = createAccessorEventConflictUnit(
          baseEventUnit,
          field,
        );
        let thrown: unknown;

        try {
          sync.resolveSyncUnitConflict(
            createEventConflictInput(side, accessorUnit.unit, validEventUnit),
          );
        } catch (error) {
          thrown = error;
        }

        expect.soft(thrown, `${field} ${side}: resolver error`).toBeInstanceOf(
          Error,
        );
        expect
          .soft(accessorUnit.readCount(), `${field} ${side}: getter reads`)
          .toBe(0);
      }
    }
  });

  it("rejects stale and unsupported sync conflict resolver unit kinds", async () => {
    const sync = await loadSyncModule();
    const basePageUnit = sync.serializeMarkdownPageSyncUnit(createMarkdownPage());
    const localPageUnit = sync.serializeMarkdownPageSyncUnit(
      createMarkdownPage({ title: "Local title" }),
    );
    const remotePageUnit = sync.serializeMarkdownPageSyncUnit(
      createMarkdownPage({ title: "Remote title" }),
    );
    const eventUnit = sync.serializeEventSyncUnit(
      createAppEvent({ id: "event-supported" }),
    );

    expect(
      sync.resolveSyncUnitConflict({
        base: basePageUnit,
        local: localPageUnit,
        remote: remotePageUnit,
        unitKind: syncUnitMetadata,
      }),
    ).toStrictEqual({
      outcome: "manual-resolution-required",
      reason: "mutable-unit-divergence",
      unitKind: syncUnitMetadata,
    });
    expect(
      sync.resolveSyncUnitConflict({
        local: [eventUnit],
        remote: [eventUnit],
        unitKind: syncUnitEvent,
      }),
    ).toStrictEqual({
      conflicts: [],
      outcome: "merged",
      unitKind: syncUnitEvent,
      units: [eventUnit],
    });

    for (const unitKind of [...staleSyncIds, "sync.unit.unsupported"] as const) {
      expect.soft(
        () =>
          sync.resolveSyncUnitConflict({
            base: basePageUnit,
            local: localPageUnit,
            remote: remotePageUnit,
            unitKind,
          }),
        unitKind,
      ).toThrow(/sync|unit|kind|unsupported|invalid|stale/i);
    }
  });

  it("keeps Sync production isolated from native/package drift, transport, storage, runtime stores, sibling plugins, and Core business terms", async () => {
    const nativeSurfaceChanges = await listNativeSurfaceChangesFromMaster();
    const productionSources = await readProductionSources(
      syncProductionEntrypoints,
    );
    const syncSources = productionSources.filter(({ filePath }) =>
      filePath.startsWith("src/plugins/sync/"),
    );
    const coreSources = await readProductionSources(["src/core"]);

    expect(
      await disallowedNativeSurfaceChanges(nativeSurfaceChanges),
    ).toStrictEqual([]);

    for (const { filePath, source } of syncSources) {
      expect(source, `${filePath}: stale Sync ids`).not.toMatch(
        /sync-plugin|sync_plugin|core\.sync|sync\.pages?|sync\.markdown_page|sync\.plugin_settings|sync\.index(?:er|es)|sync\.(?:start|push|pull|connect|login|apply|import|configure-remote)\b/u,
      );
      expect(source, `${filePath}: network, storage, worker, or native sink`)
        .not.toMatch(
          /from\s+["'](?:node:)?(?:fs|path|child_process|worker_threads|http|https|net|tls|dns|process)["']|@tauri-apps|@tauri-apps\/plugin-(?:fs|shell|opener|sql|http)|\b(?:fetch|XMLHttpRequest|WebSocket|Worker|SharedWorker|localStorage|sessionStorage|indexedDB|BroadcastChannel|navigator\.storage)\b/u,
        );
      expect(source, `${filePath}: raw runtime/store/native import`).not.toMatch(
        /from\s+["'][^"']*(?:core\/(?:stores|registries|runtime|native)|plugin-host|bootstrap)["']|\b(?:NativeBridge|PluginHost|createAppRuntime|createTauriNativeBridge|useRuntime)\b/u,
      );
      expect(source, `${filePath}: raw Core store access`).not.toMatch(
        /\b(?:pages|metadata|events|filters)\s*\.\s*(?:archive|append|create|delete|get|list|save|set|update)\b/u,
      );
      expect(source, `${filePath}: sibling plugin import`).not.toMatch(
        /from\s+["'][^"']*(?:plugins\/(?:ai|calendar|chart|habit|heatmap|markdown-editor|metadata-ui|ml|quick-capture|search|stats|tag|task|timer)|\.\.\/(?:ai|calendar|chart|habit|heatmap|markdown-editor|metadata-ui|ml|quick-capture|search|stats|tag|task|timer)(?:\/|["']))/u,
      );

      for (const settingKey of forbiddenPluginSettingsKeys) {
        expect(source, `${filePath}: ${settingKey} setting drift`).not.toMatch(
          new RegExp(`\\b${escapeRegExp(settingKey)}\\b`, "u"),
        );
      }
    }

    for (const { filePath, source } of coreSources) {
      expect(source, `${filePath}: Core Sync business terms`).not.toMatch(
        /\b(?:SyncPlugin|syncable|sync\s+unit|sync\.unit\.|sync\.rebuildable|rebuildable\s+plugin\s+indexes|sync\s+conflict|sync\s+transport|plugin\s+settings\s+sync)\b/iu,
      );
    }
  });
});

function contributionIds(
  contributions: RuntimeContributions[keyof RuntimeContributions] | undefined,
): string[] {
  if (!Array.isArray(contributions)) {
    return [];
  }

  return contributions
    .map((contribution) => contribution.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

async function loadSyncModule(): Promise<SyncModule> {
  return (await import(syncModulePath)) as SyncModule;
}

function createMarkdownPage(overrides: Partial<MarkdownPage> = {}): MarkdownPage {
  return {
    archivedAt: "2026-05-25T12:30:00.000Z",
    body: {
      content: [
        {
          attrs: {
            checked: false,
            nested: { labels: ["sync", "contract"] },
          },
          blockId: "block-sync-title",
          text: "# Sync contract",
          type: "markdown.line",
        },
      ],
      type: "doc",
    },
    createdAt: "2026-05-25T10:00:00.000Z",
    id: "page-sync",
    parentPageId: "page-parent",
    title: "Sync contract",
    updatedAt: "2026-05-25T12:00:00.000Z",
    ...overrides,
  };
}

function createMarkdownBodyWithAttrs(
  attrs: Record<string, unknown>,
): StructuredMarkdownDocument {
  return {
    content: [
      {
        attrs,
        blockId: "block-sync-attrs",
        text: "Sync attrs",
        type: "markdown.line",
      },
    ],
    type: "doc",
  };
}

function readFirstBlockAttrs(unit: SyncUnitDto): Record<string, unknown> {
  const body = unit.snapshot.body as StructuredMarkdownDocument;
  const attrs = body.content[0]?.attrs;

  if (attrs === undefined) {
    throw new Error("Expected first Markdown Page block attrs");
  }

  return attrs;
}

function createMetadataRecord(
  overrides: Partial<MetadataRecord> = {},
): MetadataRecord {
  return {
    createdAt: "2026-05-25T10:05:00.000Z",
    id: "metadata-sync-status",
    key: "status",
    namespace: "task",
    pageId: "page-sync",
    sourcePluginId: "task",
    updatedAt: "2026-05-25T11:05:00.000Z",
    value: { state: "done", tags: ["sync"] },
    valueType: "json",
    ...overrides,
  };
}

function createAppEvent(overrides: Partial<AppEvent> = {}): AppEvent {
  return {
    createdAt: "2026-05-25T11:00:00.000Z",
    id: "event-sync-created",
    namespace: "task",
    pageId: "page-sync",
    payload: { status: "done", transition: { from: "todo" } },
    sourcePluginId: "task",
    type: "completed",
    ...overrides,
  };
}

function createFilterDefinition(
  overrides: Partial<FilterDefinition> = {},
): FilterDefinition {
  return {
    createdAt: "2026-05-25T09:00:00.000Z",
    group: { field: "metadata.tag.tags" },
    id: "filter-sync-today",
    name: "Sync Today",
    query: {
      where: [
        {
          field: "metadata.task.status",
          op: "eq",
          value: "done",
        },
      ],
    },
    sort: [{ direction: "asc", field: "metadata.task.due" }],
    sourcePluginId: "task",
    updatedAt: "2026-05-25T09:30:00.000Z",
    viewType: "page.list",
    ...overrides,
  };
}

function createPluginSettingsSnapshot(
  overrides: Partial<PluginSettingsSnapshot> = {},
): PluginSettingsSnapshot {
  return {
    key: "panelState",
    pluginId: "timer",
    state: { state: "unset" },
    updatedAt: "2026-05-25T12:10:00.000Z",
    ...overrides,
  } as PluginSettingsSnapshot;
}

function createUnsafeNestedValues(): Array<{ label: string; value: unknown }> {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const inherited = Object.create({ carried: "from-prototype" }) as Record<
    string,
    unknown
  >;
  inherited.own = "own";
  const nonEnumerable: Record<string, unknown> = { visible: "visible" };
  Object.defineProperty(nonEnumerable, "hidden", {
    enumerable: false,
    value: "hidden",
  });

  return [
    { label: "function", value: () => "unsafe" },
    { label: "symbol", value: Symbol("unsafe") },
    { label: "undefined", value: undefined },
    { label: "Date", value: new Date("2026-05-25T12:00:00.000Z") },
    { label: "BigInt", value: 1n },
    { label: "cycle", value: cycle },
    { label: "Map", value: new Map([["key", "value"]]) },
    { label: "prototype-carried field", value: inherited },
    { label: "non-enumerable field", value: nonEnumerable },
    { label: "deep JSON", value: createDeepJsonValue(40) },
  ];
}

function createAccessorPayload(): {
  readCount: () => number;
  value: Record<string, unknown>;
} {
  let reads = 0;
  const value: Record<string, unknown> = {};

  Object.defineProperty(value, "secret", {
    enumerable: true,
    get() {
      reads += 1;
      return "must-not-read";
    },
  });

  return {
    readCount: () => reads,
    value,
  };
}

type EventConflictArraySide = "local" | "remote";

type AccessorEventConflictField =
  | "kind"
  | "snapshot"
  | "syncKey"
  | "syncKey.id";

function expectEventConflictUnitRejected(
  sync: SyncModule,
  options: {
    label: string;
    unit: unknown;
    validEventUnit: SyncUnitDto;
  },
): void {
  for (const side of ["local", "remote"] as const) {
    expect.soft(
      () =>
        sync.resolveSyncUnitConflict(
          createEventConflictInput(
            side,
            options.unit,
            options.validEventUnit,
          ),
        ),
      `${options.label} ${side}`,
    ).toThrow(
      /sync|unit|event|kind|schema|invalid|unsupported|stale|shape|accessor/i,
    );
  }
}

function createEventConflictInput(
  side: EventConflictArraySide,
  unit: unknown,
  validEventUnit: SyncUnitDto,
): {
  local: readonly unknown[];
  remote: readonly unknown[];
  unitKind: typeof syncUnitEvent;
} {
  return side === "local"
    ? {
        local: [unit],
        remote: [validEventUnit],
        unitKind: syncUnitEvent,
      }
    : {
        local: [validEventUnit],
        remote: [unit],
        unitKind: syncUnitEvent,
      };
}

function createRuntimeShapedEventConflictUnits(
  baseUnit: SyncUnitDto,
): Array<{ label: string; unit: Record<string, unknown> }> {
  class RuntimeEventUnit {
    kind: SyncUnitDto["kind"];
    schemaVersion: SyncUnitDto["schemaVersion"];
    snapshot: SyncUnitDto["snapshot"];
    syncKey: SyncUnitDto["syncKey"];

    constructor(unit: SyncUnitDto) {
      this.kind = unit.kind;
      this.schemaVersion = unit.schemaVersion;
      this.snapshot = unit.snapshot;
      this.syncKey = unit.syncKey;
    }

    toJSON(): Record<string, unknown> {
      return { runtime: true };
    }
  }

  const customPrototype = {
    inheritedRuntimeMethod(): string {
      return "runtime";
    },
    toJSON(): Record<string, unknown> {
      return { runtime: true };
    },
  };
  const customPrototypeUnit = Object.assign(
    Object.create(customPrototype) as Record<string, unknown>,
    {
      kind: baseUnit.kind,
      schemaVersion: baseUnit.schemaVersion,
      snapshot: baseUnit.snapshot,
      syncKey: baseUnit.syncKey,
    },
  );

  return [
    {
      label: "class-instance event unit with inherited toJSON",
      unit: new RuntimeEventUnit(baseUnit) as unknown as Record<string, unknown>,
    },
    {
      label: "custom-prototype event unit with inherited runtime methods",
      unit: customPrototypeUnit,
    },
  ];
}

function createRuntimeShapedEventSyncKeys(
  baseUnit: SyncUnitDto,
): Array<{ label: string; syncKey: Record<string, unknown> }> {
  class RuntimeSyncKey {
    id: string;

    constructor(id: string) {
      this.id = id;
    }

    toJSON(): Record<string, unknown> {
      return { id: this.id, runtime: true };
    }
  }

  const customPrototype = {
    inheritedRuntimeMethod(): string {
      return "runtime";
    },
  };
  const customPrototypeSyncKey = Object.assign(
    Object.create(customPrototype) as Record<string, unknown>,
    { id: baseUnit.syncKey.id },
  );

  return [
    {
      label: "class-instance sync key with inherited toJSON",
      syncKey: new RuntimeSyncKey(baseUnit.syncKey.id) as unknown as Record<
        string,
        unknown
      >,
    },
    {
      label: "custom-prototype sync key with exact own id",
      syncKey: customPrototypeSyncKey,
    },
  ];
}

function createAccessorEventConflictUnit(
  baseUnit: SyncUnitDto,
  field: AccessorEventConflictField,
): {
  readCount: () => number;
  unit: Record<string, unknown>;
} {
  let reads = 0;
  const unit: Record<string, unknown> = {
    ...baseUnit,
    snapshot: { ...baseUnit.snapshot },
    syncKey: { ...baseUnit.syncKey },
  };
  const recordRead = <Value>(value: Value): Value => {
    reads += 1;

    return value;
  };

  switch (field) {
    case "syncKey":
      Object.defineProperty(unit, "syncKey", {
        enumerable: true,
        get() {
          return recordRead(baseUnit.syncKey);
        },
      });
      break;
    case "syncKey.id": {
      const syncKey: Record<string, unknown> = { ...baseUnit.syncKey };

      Object.defineProperty(syncKey, "id", {
        enumerable: true,
        get() {
          return recordRead(baseUnit.syncKey.id);
        },
      });
      unit.syncKey = syncKey;
      break;
    }
    case "kind":
      Object.defineProperty(unit, "kind", {
        enumerable: true,
        get() {
          return recordRead(baseUnit.kind);
        },
      });
      break;
    case "snapshot":
      Object.defineProperty(unit, "snapshot", {
        enumerable: true,
        get() {
          return recordRead(baseUnit.snapshot);
        },
      });
      break;
  }

  return {
    readCount: () => reads,
    unit,
  };
}

function createDeepJsonValue(depth: number): MetadataJsonValue {
  let value: MetadataJsonValue = "leaf";

  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }

  return value;
}

async function readProductionSources(
  entrypoints: readonly string[],
): Promise<Array<{ filePath: string; source: string }>> {
  const files = await runGitLines([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...entrypoints,
  ]);
  const sourceFiles = files.filter(
    (filePath) =>
      /\.(?:ts|tsx)$/u.test(filePath) &&
      !filePath.includes("/__tests__/") &&
      !filePath.endsWith(".test.ts") &&
      !filePath.endsWith(".test.tsx"),
  );

  return Promise.all(
    sourceFiles.map(async (filePath) => ({
      filePath,
      source: await readFile(path.join(repoRoot, filePath), "utf8"),
    })),
  );
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
