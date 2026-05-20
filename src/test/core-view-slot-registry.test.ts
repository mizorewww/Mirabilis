import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ComponentType } from "react";

import {
  SlotRegistryError,
  ViewRegistryError,
  createInMemorySlotRegistry,
  createInMemoryViewRegistry,
} from "../core";
import {
  SlotRegistryError as SlotRegistryErrorFromRegistries,
  ViewRegistryError as ViewRegistryErrorFromRegistries,
  createInMemorySlotRegistry as createInMemorySlotRegistryFromRegistries,
  createInMemoryViewRegistry as createInMemoryViewRegistryFromRegistries,
} from "../core/registries";
import type {
  ListSlotContributionsOptions,
  ListViewsOptions,
  MetadataJsonValue,
  RegistryComponent,
  SlotCondition,
  SlotContribution,
  SlotRegistry,
  SlotRegistryErrorCode,
  ViewDataShape,
  ViewDefinition,
  ViewRegistry,
  ViewRegistryErrorCode,
} from "../core";
import type {
  ListSlotContributionsOptions as ListSlotContributionsOptionsFromRegistries,
  ListViewsOptions as ListViewsOptionsFromRegistries,
  RegistryComponent as RegistryComponentFromRegistries,
  SlotCondition as SlotConditionFromRegistries,
  SlotContribution as SlotContributionFromRegistries,
  SlotRegistry as SlotRegistryFromRegistries,
  SlotRegistryErrorCode as SlotRegistryErrorCodeFromRegistries,
  ViewDataShape as ViewDataShapeFromRegistries,
  ViewDefinition as ViewDefinitionFromRegistries,
  ViewRegistry as ViewRegistryFromRegistries,
  ViewRegistryErrorCode as ViewRegistryErrorCodeFromRegistries,
} from "../core/registries";

type ViewProps = {
  surface: string;
};

type SlotProps = {
  region: string;
};

type MemoLikeComponentRef<Props> = {
  readonly $$typeof: symbol;
  readonly type: ComponentType<Props>;
};

type LazyLikeComponentRef<Props> = {
  readonly $$typeof: symbol;
  readonly _payload: unknown;
  readonly _init: () => ComponentType<Props>;
};

const WorkspaceListPanel: ComponentType<ViewProps> = () => null;
const WorkspaceDetailPanel: ComponentType<ViewProps> = () => null;
const WorkspaceHeaderSlot: ComponentType<SlotProps> = () => null;
const WorkspaceStatusSlot: ComponentType<SlotProps> = () => null;

describe("in-memory View Registry and Slot Registry", () => {
  it("exports the public View and Slot Registry APIs from Core entrypoints", () => {
    expect(createInMemoryViewRegistry).toEqual(expect.any(Function));
    expect(createInMemoryViewRegistryFromRegistries).toBe(
      createInMemoryViewRegistry,
    );
    expect(ViewRegistryError).toEqual(expect.any(Function));
    expect(ViewRegistryErrorFromRegistries).toBe(ViewRegistryError);

    expect(createInMemorySlotRegistry).toEqual(expect.any(Function));
    expect(createInMemorySlotRegistryFromRegistries).toBe(
      createInMemorySlotRegistry,
    );
    expect(SlotRegistryError).toEqual(expect.any(Function));
    expect(SlotRegistryErrorFromRegistries).toBe(SlotRegistryError);

    expectTypeOf<RegistryComponentFromRegistries<ViewProps>>()
      .toEqualTypeOf<RegistryComponent<ViewProps>>();
    expectTypeOf<ViewDefinitionFromRegistries<ViewProps>>().toEqualTypeOf<
      ViewDefinition<ViewProps>
    >();
    expectTypeOf<ViewDataShapeFromRegistries>().toEqualTypeOf<ViewDataShape>();
    expectTypeOf<ViewRegistryFromRegistries>().toEqualTypeOf<ViewRegistry>();
    expectTypeOf<ViewRegistryErrorCodeFromRegistries>().toEqualTypeOf<
      ViewRegistryErrorCode
    >();
    expectTypeOf<ListViewsOptionsFromRegistries>().toEqualTypeOf<
      ListViewsOptions
    >();

    expectTypeOf<SlotContributionFromRegistries<SlotProps>>().toEqualTypeOf<
      SlotContribution<SlotProps>
    >();
    expectTypeOf<SlotConditionFromRegistries<SlotProps>>().toEqualTypeOf<
      SlotCondition<SlotProps>
    >();
    expectTypeOf<SlotRegistryFromRegistries>().toEqualTypeOf<SlotRegistry>();
    expectTypeOf<SlotRegistryErrorCodeFromRegistries>().toEqualTypeOf<
      SlotRegistryErrorCode
    >();
    expectTypeOf<
      ListSlotContributionsOptionsFromRegistries
    >().toEqualTypeOf<ListSlotContributionsOptions>();

    expectTypeOf<ComponentType<ViewProps>>().toMatchTypeOf<
      RegistryComponent<ViewProps>
    >();
    expectTypeOf<MemoLikeComponentRef<ViewProps>>().toMatchTypeOf<
      RegistryComponent<ViewProps>
    >();
    expectTypeOf<LazyLikeComponentRef<ViewProps>>().toMatchTypeOf<
      RegistryComponent<ViewProps>
    >();
    expectTypeOf<ViewDataShape>().toEqualTypeOf<MetadataJsonValue>();
    expectTypeOf<ViewDefinition<ViewProps>>().toEqualTypeOf<{
      id: string;
      pluginId: string;
      type: string;
      title: string;
      component: RegistryComponent<ViewProps>;
      accepts: ViewDataShape;
    }>();
    expectTypeOf<ViewDefinition["component"]>().toEqualTypeOf<
      RegistryComponent<unknown>
    >();
    expectTypeOf<ListViewsOptions>().toEqualTypeOf<{
      pluginId?: string;
      type?: string;
    }>();
    expectTypeOf<ViewRegistry>().toEqualTypeOf<{
      register<Props = unknown>(
        definition: ViewDefinition<Props>,
      ): ViewDefinition<Props>;
      get(viewId: string): ViewDefinition;
      list(options?: ListViewsOptions): ViewDefinition[];
      unregister(viewId: string): ViewDefinition;
    }>();
    expectTypeOf<ViewRegistryError>().toMatchObjectType<{
      code: ViewRegistryErrorCode;
      cause?: unknown;
    }>();
    expectTypeOf<ViewRegistryErrorCode>().toEqualTypeOf<
      | "VIEW_NOT_FOUND"
      | "VIEW_ID_COLLISION"
      | "VIEW_IDENTITY_REQUIRED"
      | "VIEW_PLUGIN_ID_REQUIRED"
      | "VIEW_TYPE_REQUIRED"
      | "VIEW_TITLE_REQUIRED"
      | "VIEW_COMPONENT_REQUIRED"
      | "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE"
    >();

    expectTypeOf<SlotCondition<SlotProps>>().toEqualTypeOf<
      (props: SlotProps) => boolean
    >();
    expectTypeOf<SlotContribution<SlotProps>>().toEqualTypeOf<{
      id: string;
      pluginId: string;
      slot: string;
      order?: number;
      when?: SlotCondition<SlotProps>;
      component: RegistryComponent<SlotProps>;
    }>();
    expectTypeOf<SlotContribution["component"]>().toEqualTypeOf<
      RegistryComponent<unknown>
    >();
    expectTypeOf<SlotContribution["when"]>().toEqualTypeOf<
      SlotCondition<unknown> | undefined
    >();
    expectTypeOf<ListSlotContributionsOptions>().toEqualTypeOf<{
      pluginId?: string;
      slot?: string;
    }>();
    expectTypeOf<SlotRegistry>().toEqualTypeOf<{
      register<Props = unknown>(
        contribution: SlotContribution<Props>,
      ): SlotContribution<Props>;
      get(contributionId: string): SlotContribution;
      list(options?: ListSlotContributionsOptions): SlotContribution[];
      unregister(contributionId: string): SlotContribution;
    }>();
    expectTypeOf<SlotRegistryError>().toMatchObjectType<{
      code: SlotRegistryErrorCode;
      cause?: unknown;
    }>();
    expectTypeOf<SlotRegistryErrorCode>().toEqualTypeOf<
      | "SLOT_NOT_FOUND"
      | "SLOT_ID_COLLISION"
      | "SLOT_IDENTITY_REQUIRED"
      | "SLOT_PLUGIN_ID_REQUIRED"
      | "SLOT_NAME_REQUIRED"
      | "SLOT_COMPONENT_REQUIRED"
      | "SLOT_CONDITION_REQUIRED"
      | "SLOT_ORDER_INVALID"
    >();
    expectTypeOf<ReturnType<typeof createInMemoryViewRegistry>>()
      .toEqualTypeOf<ViewRegistry>();
    expectTypeOf<ReturnType<typeof createInMemorySlotRegistry>>()
      .toEqualTypeOf<SlotRegistry>();
  });

  it("registers, gets, lists, filters, unregisters, and re-registers views", () => {
    const views = createInMemoryViewRegistry();
    const first = views.register(
      viewDefinition({
        id: "workspace.list.primary",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Primary workspace list",
        component: WorkspaceListPanel,
      }),
    );
    const second = views.register(
      viewDefinition({
        id: "workspace.list.secondary",
        pluginId: "workspace.extra",
        type: "workspace.list",
        title: "Secondary workspace list",
        component: WorkspaceDetailPanel,
      }),
    );
    const third = views.register(
      viewDefinition({
        id: "inspector.detail",
        pluginId: "inspector",
        type: "workspace.detail",
        title: "Inspector detail",
        component: WorkspaceDetailPanel,
      }),
    );

    expect(views.get("workspace.list.primary")).toStrictEqual(first);
    expect(views.list()).toStrictEqual([first, second, third]);
    expect(views.list().map((view: ViewDefinition) => view.id)).toStrictEqual([
      "workspace.list.primary",
      "workspace.list.secondary",
      "inspector.detail",
    ]);
    expect(views.list({ pluginId: "workspace" })).toStrictEqual([first]);
    expect(views.list({ pluginId: "workspace.extra" })).toStrictEqual([
      second,
    ]);
    expect(views.list({ type: "workspace.list" })).toStrictEqual([
      first,
      second,
    ]);
    expect(
      views.list({
        pluginId: "workspace.extra",
        type: "workspace.list",
      }),
    ).toStrictEqual([second]);
    expect(views.list({ pluginId: "missing" })).toStrictEqual([]);
    expect(views.list({ type: "missing" })).toStrictEqual([]);

    expect(views.unregister("workspace.list.secondary")).toStrictEqual(second);
    expect(views.list()).toStrictEqual([first, third]);
    expectViewRegistryError(
      () => views.get("workspace.list.secondary"),
      "VIEW_NOT_FOUND",
    );
    expectViewRegistryError(
      () => views.unregister("workspace.list.secondary"),
      "VIEW_NOT_FOUND",
    );

    const replacement = views.register(
      viewDefinition({
        id: "workspace.list.secondary",
        pluginId: "workspace.extra",
        type: "workspace.list",
        title: "Replacement workspace list",
        component: WorkspaceListPanel,
      }),
    );

    expect(replacement.title).toBe("Replacement workspace list");
    expect(views.get("workspace.list.secondary")).toStrictEqual(replacement);
  });

  it("filters views by exact nonblank plugin ids and types without trimming significant whitespace", () => {
    const views = createInMemoryViewRegistry();
    const padded = views.register(
      viewDefinition({
        id: "workspace.padded",
        pluginId: " workspace ",
        type: " workspace.list ",
        title: "Padded workspace list",
      }),
    );
    const exact = views.register(
      viewDefinition({
        id: "workspace.exact",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Exact workspace list",
      }),
    );

    expect(views.get("workspace.padded")).toStrictEqual(padded);
    expect(views.list({ pluginId: " workspace " })).toStrictEqual([padded]);
    expect(views.list({ pluginId: "workspace" })).toStrictEqual([exact]);
    expect(views.list({ type: " workspace.list " })).toStrictEqual([padded]);
    expect(views.list({ type: "workspace.list" })).toStrictEqual([exact]);
    expect(
      views.list({
        pluginId: " workspace ",
        type: "workspace.list",
      }),
    ).toStrictEqual([]);
  });

  it("accepts and preserves React-compatible object view component references", () => {
    const views = createInMemoryViewRegistry();
    const memoLikeComponentRef = {
      $$typeof: Symbol.for("react.memo"),
      type: WorkspaceListPanel,
    } satisfies MemoLikeComponentRef<ViewProps>;
    const memoLikeComponent =
      memoLikeComponentRef as unknown as RegistryComponent<ViewProps>;

    const registered = views.register(
      viewDefinition({
        id: "workspace.memo-like",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Memo-like workspace list",
        component: memoLikeComponent,
      }),
    );

    expect(registered.component).toBe(memoLikeComponent);
    expect(views.get("workspace.memo-like").component).toBe(memoLikeComponent);
    expect(views.list()[0]!.component).toBe(memoLikeComponent);
    expect(views.unregister("workspace.memo-like").component).toBe(
      memoLikeComponent,
    );
  });

  it("keeps view component references inert through register, get, list, and unregister", () => {
    const views = createInMemoryViewRegistry();
    const throwingComponent = vi.fn<ComponentType<ViewProps>>(() => {
      throw new Error("view component executed");
    });

    const registered = views.register(
      viewDefinition({
        id: "workspace.inert-component",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Inert component workspace list",
        component: throwingComponent,
      }),
    );

    expect(registered.component).toBe(throwingComponent);
    expect(views.get("workspace.inert-component").component).toBe(
      throwingComponent,
    );
    expect(views.list()[0]!.component).toBe(throwingComponent);
    expect(views.unregister("workspace.inert-component").component).toBe(
      throwingComponent,
    );
    expect(throwingComponent).not.toHaveBeenCalled();
  });

  it("registers view definitions from own data descriptors without invoking proxy get traps", () => {
    const views = createInMemoryViewRegistry();
    const getTrap = vi.fn<
      NonNullable<ProxyHandler<ViewDefinition<ViewProps>>["get"]>
    >(() => {
      throw new Error("view proxy get trap escaped");
    });
    const proxiedDefinition = viewProxyWithThrowingGetForAllProperties(
      viewDefinition({
        id: "workspace.proxy-descriptor",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Proxy descriptor workspace list",
        component: WorkspaceListPanel,
        accepts: { shape: "collection" },
      }),
      getTrap,
    );

    const registered = views.register(proxiedDefinition);

    expect(getTrap.mock.calls.length).toBe(0);
    expect(registered).toStrictEqual({
      id: "workspace.proxy-descriptor",
      pluginId: "workspace",
      type: "workspace.list",
      title: "Proxy descriptor workspace list",
      component: WorkspaceListPanel,
      accepts: { shape: "collection" },
    });
    expect(views.get("workspace.proxy-descriptor")).toStrictEqual(registered);
  });

  it("rejects duplicate view ids with typed errors and preserves the original view", () => {
    const views = createInMemoryViewRegistry();
    const original = views.register(
      viewDefinition({
        id: "workspace.list.primary",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Primary workspace list",
        component: WorkspaceListPanel,
        accepts: {
          shape: "collection",
          options: { density: "compact" },
        },
      }),
    );
    const duplicateAcceptsError = new Error("duplicate accepts escaped");

    expectViewRegistryError(
      () =>
        views.register(
          viewWithThrowingAcceptsGetter(
            viewDefinition({
              id: "workspace.list.primary",
              pluginId: "other-workspace",
              type: "workspace.detail",
              title: "Duplicate workspace list",
              component: WorkspaceDetailPanel,
            }),
            duplicateAcceptsError,
          ),
        ),
      "VIEW_ID_COLLISION",
      { rawError: duplicateAcceptsError },
    );

    expect(views.get("workspace.list.primary")).toStrictEqual(original);
    expect(views.list()).toStrictEqual([original]);
    expect(views.get("workspace.list.primary").component).toBe(
      WorkspaceListPanel,
    );
  });

  it("preserves view component identity while defensively cloning accepts metadata and returned objects", () => {
    const views = createInMemoryViewRegistry();
    const accepts = {
      shape: "collection",
      supports: ["selection", "preview"],
      options: {
        density: "comfortable",
        maxItems: 12,
        empty: null,
      },
    } satisfies ViewDataShape;
    const registered = views.register(
      viewDefinition({
        id: "workspace.list.primary",
        pluginId: "workspace",
        type: "workspace.list",
        title: "Primary workspace list",
        component: WorkspaceListPanel,
        accepts,
      }),
    );

    mutateAccepts(accepts, "input-mutated");
    mutateAccepts(registered.accepts, "register-return-mutated");

    const expected: ViewDefinition = {
      id: "workspace.list.primary",
      pluginId: "workspace",
      type: "workspace.list",
      title: "Primary workspace list",
      component: WorkspaceListPanel,
      accepts: {
        shape: "collection",
        supports: ["selection", "preview"],
        options: {
          density: "comfortable",
          maxItems: 12,
          empty: null,
        },
      },
    };

    const firstRead = views.get("workspace.list.primary");
    const secondRead = views.get("workspace.list.primary");

    expect(firstRead).toStrictEqual(expected);
    expect(secondRead).toStrictEqual(expected);
    expect(firstRead).not.toBe(secondRead);
    expect(firstRead.component).toBe(WorkspaceListPanel);
    expect(firstRead.accepts).not.toBe(accepts);
    expect(firstRead.accepts).not.toBe(registered.accepts);

    mutateAccepts(firstRead.accepts, "get-return-mutated");
    expect(views.get("workspace.list.primary")).toStrictEqual(expected);

    const listed = views.list();
    mutateAccepts(listed[0]!.accepts, "list-return-mutated");
    listed.push(
      viewDefinition({
        id: "extra.view",
        pluginId: "extra",
        type: "workspace.detail",
        title: "Extra view",
        component: WorkspaceDetailPanel,
      }),
    );
    expect(views.list()).toStrictEqual([expected]);
    expect(views.list()[0]!.component).toBe(WorkspaceListPanel);

    const removed = views.unregister("workspace.list.primary");
    mutateAccepts(removed.accepts, "unregister-return-mutated");
    expect(removed.component).toBe(WorkspaceListPanel);
    expectViewRegistryError(
      () => views.get("workspace.list.primary"),
      "VIEW_NOT_FOUND",
    );
  });

  it("rejects invalid view definitions with typed errors without mutating state", () => {
    const viewPluginDescriptorError = new Error(
      "view plugin descriptor escaped",
    );
    const invalidCases: Array<{
      name: string;
      definition: () => ViewDefinition;
      code: ViewRegistryErrorCode;
      rawError?: Error;
    }> = [
      {
        name: "non-string id",
        definition: () => viewDefinition({ id: 42 as unknown as string }),
        code: "VIEW_IDENTITY_REQUIRED",
      },
      {
        name: "blank id",
        definition: () => viewDefinition({ id: " \n\t " }),
        code: "VIEW_IDENTITY_REQUIRED",
      },
      {
        name: "non-string plugin id",
        definition: () =>
          viewDefinition({ pluginId: 42 as unknown as string }),
        code: "VIEW_PLUGIN_ID_REQUIRED",
      },
      {
        name: "blank plugin id",
        definition: () => viewDefinition({ pluginId: " " }),
        code: "VIEW_PLUGIN_ID_REQUIRED",
      },
      {
        name: "non-string type",
        definition: () => viewDefinition({ type: 42 as unknown as string }),
        code: "VIEW_TYPE_REQUIRED",
      },
      {
        name: "blank type",
        definition: () => viewDefinition({ type: "\t" }),
        code: "VIEW_TYPE_REQUIRED",
      },
      {
        name: "non-string title",
        definition: () => viewDefinition({ title: 42 as unknown as string }),
        code: "VIEW_TITLE_REQUIRED",
      },
      {
        name: "blank title",
        definition: () => viewDefinition({ title: "\n" }),
        code: "VIEW_TITLE_REQUIRED",
      },
      {
        name: "non-function component",
        definition: () =>
          viewDefinition({
            component: "not a component" as unknown as RegistryComponent,
          }),
        code: "VIEW_COMPONENT_REQUIRED",
      },
      ...invalidAcceptsCases().map((invalidCase) => ({
        name: invalidCase.name,
        definition: () => viewDefinition({ accepts: invalidCase.value() }),
        code: "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE" as const,
        rawError: invalidCase.rawError,
      })),
      {
        name: "id getter",
        definition: () =>
          viewWithThrowingGetter(
            "id",
            new Error("view id getter escaped"),
          ),
        code: "VIEW_IDENTITY_REQUIRED",
      },
      {
        name: "plugin id descriptor trap",
        rawError: viewPluginDescriptorError,
        definition: () =>
          viewProxyWithThrowingDescriptor(
            "pluginId",
            viewPluginDescriptorError,
          ),
        code: "VIEW_PLUGIN_ID_REQUIRED",
      },
      {
        name: "accepts proxy",
        definition: () =>
          viewDefinition({
            accepts: proxyWithThrowingOwnKeys(
              { shape: "collection" },
              new Error("view accepts ownKeys escaped"),
            ) as ViewDataShape,
          }),
        code: "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      },
    ];

    for (const invalidCase of invalidCases) {
      const views = createInMemoryViewRegistry();
      const existing = views.register(
        viewDefinition({
          id: "workspace.existing",
          pluginId: "workspace",
          type: "workspace.list",
          title: "Existing workspace list",
          component: WorkspaceListPanel,
        }),
      );

      expectViewRegistryError(
        () => views.register(invalidCase.definition()),
        invalidCase.code,
        invalidCase.rawError === undefined
          ? undefined
          : { rawError: invalidCase.rawError },
      );
      expect(views.get("workspace.existing")).toStrictEqual(existing);
      expect(views.list()).toStrictEqual([existing]);
    }

    const views = createInMemoryViewRegistry();
    const existing = views.register(viewDefinition());

    expectViewRegistryError(
      () => views.list({ pluginId: " " }),
      "VIEW_PLUGIN_ID_REQUIRED",
    );
    expectViewRegistryError(
      () => views.list({ type: "\n" }),
      "VIEW_TYPE_REQUIRED",
    );
    expect(views.list()).toStrictEqual([existing]);
  });

  it("registers, gets, lists, filters, unregisters, and re-registers slot contributions", () => {
    const slots = createInMemorySlotRegistry();
    const first = slots.register(
      slotContribution({
        id: "workspace.header.primary",
        pluginId: "workspace",
        slot: "workspace.header",
        component: WorkspaceHeaderSlot,
      }),
    );
    const second = slots.register(
      slotContribution({
        id: "workspace.header.secondary",
        pluginId: "workspace.extra",
        slot: "workspace.header",
        component: WorkspaceStatusSlot,
      }),
    );
    const third = slots.register(
      slotContribution({
        id: "inspector.sidebar.primary",
        pluginId: "inspector",
        slot: "workspace.sidebar",
        component: WorkspaceStatusSlot,
      }),
    );

    expect(slots.get("workspace.header.primary")).toStrictEqual(first);
    expect(slots.list()).toStrictEqual([first, second, third]);
    expect(
      slots.list().map((contribution: SlotContribution) => contribution.id),
    ).toStrictEqual([
      "workspace.header.primary",
      "workspace.header.secondary",
      "inspector.sidebar.primary",
    ]);
    expect(slots.list({ pluginId: "workspace" })).toStrictEqual([first]);
    expect(slots.list({ pluginId: "workspace.extra" })).toStrictEqual([
      second,
    ]);
    expect(slots.list({ slot: "workspace.header" })).toStrictEqual([
      first,
      second,
    ]);
    expect(
      slots.list({
        pluginId: "workspace.extra",
        slot: "workspace.header",
      }),
    ).toStrictEqual([second]);
    expect(slots.list({ pluginId: "missing" })).toStrictEqual([]);
    expect(slots.list({ slot: "missing" })).toStrictEqual([]);

    expect(slots.unregister("workspace.header.secondary")).toStrictEqual(
      second,
    );
    expect(slots.list()).toStrictEqual([first, third]);
    expectSlotRegistryError(
      () => slots.get("workspace.header.secondary"),
      "SLOT_NOT_FOUND",
    );
    expectSlotRegistryError(
      () => slots.unregister("workspace.header.secondary"),
      "SLOT_NOT_FOUND",
    );

    const replacement = slots.register(
      slotContribution({
        id: "workspace.header.secondary",
        pluginId: "workspace.extra",
        slot: "workspace.header",
        component: WorkspaceHeaderSlot,
      }),
    );

    expect(replacement.component).toBe(WorkspaceHeaderSlot);
    expect(slots.get("workspace.header.secondary")).toStrictEqual(replacement);
  });

  it("filters slot contributions by exact nonblank plugin ids and slot names without trimming significant whitespace", () => {
    const slots = createInMemorySlotRegistry();
    const padded = slots.register(
      slotContribution({
        id: "workspace.header.padded",
        pluginId: " workspace ",
        slot: " workspace.header ",
        component: WorkspaceHeaderSlot,
      }),
    );
    const exact = slots.register(
      slotContribution({
        id: "workspace.header.exact",
        pluginId: "workspace",
        slot: "workspace.header",
        component: WorkspaceStatusSlot,
      }),
    );

    expect(slots.get("workspace.header.padded")).toStrictEqual(padded);
    expect(slots.list({ pluginId: " workspace " })).toStrictEqual([padded]);
    expect(slots.list({ pluginId: "workspace" })).toStrictEqual([exact]);
    expect(slots.list({ slot: " workspace.header " })).toStrictEqual([
      padded,
    ]);
    expect(slots.list({ slot: "workspace.header" })).toStrictEqual([exact]);
    expect(
      slots.list({
        pluginId: " workspace ",
        slot: "workspace.header",
      }),
    ).toStrictEqual([]);
  });

  it("accepts and preserves React-compatible object slot component references", () => {
    const slots = createInMemorySlotRegistry();
    const lazyLikeComponentRef = {
      $$typeof: Symbol.for("react.lazy"),
      _payload: { component: WorkspaceHeaderSlot },
      _init: () => WorkspaceHeaderSlot,
    } satisfies LazyLikeComponentRef<SlotProps>;
    const lazyLikeComponent =
      lazyLikeComponentRef as unknown as RegistryComponent<SlotProps>;

    const registered = slots.register(
      slotContribution({
        id: "workspace.header.lazy-like",
        pluginId: "workspace",
        slot: "workspace.header",
        component: lazyLikeComponent,
      }),
    );

    expect(registered.component).toBe(lazyLikeComponent);
    expect(slots.get("workspace.header.lazy-like").component).toBe(
      lazyLikeComponent,
    );
    expect(slots.list()[0]!.component).toBe(lazyLikeComponent);
    expect(slots.unregister("workspace.header.lazy-like").component).toBe(
      lazyLikeComponent,
    );
  });

  it("keeps slot component references inert through register, get, list, and unregister", () => {
    const slots = createInMemorySlotRegistry();
    const throwingComponent = vi.fn<ComponentType<SlotProps>>(() => {
      throw new Error("slot component executed");
    });

    const registered = slots.register(
      slotContribution({
        id: "workspace.header.inert-component",
        pluginId: "workspace",
        slot: "workspace.header",
        component: throwingComponent,
      }),
    );

    expect(registered.component).toBe(throwingComponent);
    expect(slots.get("workspace.header.inert-component").component).toBe(
      throwingComponent,
    );
    expect(slots.list()[0]!.component).toBe(throwingComponent);
    expect(slots.unregister("workspace.header.inert-component").component).toBe(
      throwingComponent,
    );
    expect(throwingComponent).not.toHaveBeenCalled();
  });

  it("registers slot contributions from own data descriptors without invoking proxy get traps", () => {
    const slots = createInMemorySlotRegistry();
    const when = vi.fn<SlotCondition<SlotProps>>(() => true);
    const getTrap = vi.fn<
      NonNullable<ProxyHandler<SlotContribution<SlotProps>>["get"]>
    >(() => {
      throw new Error("slot proxy get trap escaped");
    });
    const proxiedContribution = slotProxyWithThrowingGetForAllProperties(
      slotContribution({
        id: "workspace.header.proxy-descriptor",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 2,
        when,
        component: WorkspaceHeaderSlot,
      }),
      getTrap,
    );

    const registered = slots.register(proxiedContribution);

    expect(getTrap.mock.calls.length).toBe(0);
    expect(registered).toStrictEqual({
      id: "workspace.header.proxy-descriptor",
      pluginId: "workspace",
      slot: "workspace.header",
      order: 2,
      when,
      component: WorkspaceHeaderSlot,
    });
    expect(slots.get("workspace.header.proxy-descriptor")).toStrictEqual(
      registered,
    );
    expect(when).not.toHaveBeenCalled();
  });

  it("rejects duplicate slot ids with typed errors and preserves the original contribution", () => {
    const slots = createInMemorySlotRegistry();
    const original = slots.register(
      slotContribution({
        id: "workspace.header.primary",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 10,
        component: WorkspaceHeaderSlot,
      }),
    );
    const duplicateSlotError = new Error("duplicate slot getter escaped");

    expectSlotRegistryError(
      () =>
        slots.register(
          slotWithThrowingGetter(
            slotContribution({
              id: "workspace.header.primary",
              pluginId: "other-workspace",
              slot: "workspace.sidebar",
              order: Number.NaN,
              component: WorkspaceStatusSlot,
            }),
            "slot",
            duplicateSlotError,
          ),
        ),
      "SLOT_ID_COLLISION",
      { rawError: duplicateSlotError },
    );

    expect(slots.get("workspace.header.primary")).toStrictEqual(original);
    expect(slots.list()).toStrictEqual([original]);
    expect(slots.get("workspace.header.primary").component).toBe(
      WorkspaceHeaderSlot,
    );
  });

  it("orders slot contributions by finite numeric order with stable registration-order ties", () => {
    const slots = createInMemorySlotRegistry();
    const positive = slots.register(
      slotContribution({
        id: "workspace.header.positive",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 20,
      }),
    );
    const defaultFirst = slots.register(
      slotContribution({
        id: "workspace.header.default-first",
        pluginId: "workspace",
        slot: "workspace.header",
      }),
    );
    const negative = slots.register(
      slotContribution({
        id: "workspace.header.negative",
        pluginId: "workspace",
        slot: "workspace.header",
        order: -10,
      }),
    );
    const zero = slots.register(
      slotContribution({
        id: "workspace.header.zero",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 0,
      }),
    );
    const defaultSecond = slots.register(
      slotContribution({
        id: "workspace.header.default-second",
        pluginId: "workspace.extra",
        slot: "workspace.header",
      }),
    );
    const sidebar = slots.register(
      slotContribution({
        id: "workspace.sidebar.earliest",
        pluginId: "inspector",
        slot: "workspace.sidebar",
        order: -30,
      }),
    );

    expect(slots.list({ slot: "workspace.header" })).toStrictEqual([
      negative,
      defaultFirst,
      zero,
      defaultSecond,
      positive,
    ]);
    expect(slots.list()).toStrictEqual([
      sidebar,
      negative,
      defaultFirst,
      zero,
      defaultSecond,
      positive,
    ]);
    expect(
      slots
        .list({ pluginId: "workspace" })
        .map((contribution: SlotContribution) => contribution.id),
    ).toStrictEqual([
      "workspace.header.negative",
      "workspace.header.default-first",
      "workspace.header.zero",
      "workspace.header.positive",
    ]);
    expect(defaultFirst.order).toBeUndefined();
    expect(defaultSecond.order).toBeUndefined();
  });

  it("rejects invalid slot order values with typed errors without mutating state", () => {
    const invalidOrderCases: Array<{
      name: string;
      order: number;
    }> = [
      { name: "NaN", order: Number.NaN },
      { name: "Infinity", order: Number.POSITIVE_INFINITY },
      { name: "negative Infinity", order: Number.NEGATIVE_INFINITY },
      { name: "non-number", order: "middle" as unknown as number },
    ];

    for (const invalidCase of invalidOrderCases) {
      const slots = createInMemorySlotRegistry();
      const existing = slots.register(
        slotContribution({
          id: "workspace.header.existing",
          pluginId: "workspace",
          slot: "workspace.header",
          order: -1,
        }),
      );

      expectSlotRegistryError(
        () =>
          slots.register(
            slotContribution({
              id: `workspace.header.invalid-${invalidCase.name}`,
              order: invalidCase.order,
            }),
          ),
        "SLOT_ORDER_INVALID",
      );
      expect(slots.get("workspace.header.existing")).toStrictEqual(existing);
      expect(slots.list()).toStrictEqual([existing]);
    }
  });

  it("preserves slot component and condition identity while keeping conditions inert", () => {
    const slots = createInMemorySlotRegistry();
    const trackedWhen = vi.fn<SlotCondition<SlotProps>>(
      (props: SlotProps) => props.region === "header",
    );
    const throwingWhen: SlotCondition<SlotProps> = () => {
      throw new Error("slot condition executed");
    };
    const first = slots.register(
      slotContribution({
        id: "workspace.header.tracked",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 5,
        when: trackedWhen,
        component: WorkspaceHeaderSlot,
      }),
    );
    const second = slots.register(
      slotContribution({
        id: "workspace.header.throwing",
        pluginId: "workspace",
        slot: "workspace.header",
        order: -5,
        when: throwingWhen,
        component: WorkspaceStatusSlot,
      }),
    );

    expect(first.when).toBe(trackedWhen);
    expect(second.when).toBe(throwingWhen);
    expect(slots.get("workspace.header.tracked").when).toBe(trackedWhen);
    expect(slots.get("workspace.header.throwing").when).toBe(throwingWhen);
    expect(slots.list()).toStrictEqual([second, first]);
    expect(slots.list({ slot: "workspace.header" })).toStrictEqual([
      second,
      first,
    ]);
    expect(slots.unregister("workspace.header.tracked").when).toBe(
      trackedWhen,
    );
    expect(slots.unregister("workspace.header.throwing").when).toBe(
      throwingWhen,
    );
    expect(trackedWhen).not.toHaveBeenCalled();
  });

  it("returns defensive slot copies while preserving component and condition references", () => {
    const slots = createInMemorySlotRegistry();
    const when = vi.fn<SlotCondition<SlotProps>>(() => true);
    const registered = slots.register(
      slotContribution({
        id: "workspace.header.primary",
        pluginId: "workspace",
        slot: "workspace.header",
        order: 1,
        when,
        component: WorkspaceHeaderSlot,
      }),
    );
    const expected: SlotContribution = {
      id: "workspace.header.primary",
      pluginId: "workspace",
      slot: "workspace.header",
      order: 1,
      when,
      component: WorkspaceHeaderSlot,
    };

    mutateSlotContribution(registered, "mutated-register-return");

    const firstRead = slots.get("workspace.header.primary");
    const secondRead = slots.get("workspace.header.primary");

    expect(firstRead).toStrictEqual(expected);
    expect(secondRead).toStrictEqual(expected);
    expect(firstRead).not.toBe(secondRead);
    expect(firstRead.component).toBe(WorkspaceHeaderSlot);
    expect(firstRead.when).toBe(when);

    mutateSlotContribution(firstRead, "mutated-get-return");
    expect(slots.get("workspace.header.primary")).toStrictEqual(expected);

    const listed = slots.list();
    mutateSlotContribution(listed[0]!, "mutated-list-return");
    listed.push(
      slotContribution({
        id: "extra.slot",
        pluginId: "extra",
        slot: "workspace.header",
      }),
    );
    expect(slots.list()).toStrictEqual([expected]);
    expect(slots.list()[0]!.component).toBe(WorkspaceHeaderSlot);
    expect(slots.list()[0]!.when).toBe(when);

    const removed = slots.unregister("workspace.header.primary");
    mutateSlotContribution(removed, "mutated-unregister-return");
    expect(removed.component).toBe(WorkspaceHeaderSlot);
    expect(removed.when).toBe(when);
    expect(when).not.toHaveBeenCalled();
    expectSlotRegistryError(
      () => slots.get("workspace.header.primary"),
      "SLOT_NOT_FOUND",
    );
  });

  it("rejects invalid slot contributions with typed errors without mutating state", () => {
    const slotNameDescriptorError = new Error("slot name descriptor escaped");
    const invalidCases: Array<{
      name: string;
      contribution: () => SlotContribution;
      code: SlotRegistryErrorCode;
      rawError?: Error;
    }> = [
      {
        name: "non-string id",
        contribution: () =>
          slotContribution({ id: 42 as unknown as string }),
        code: "SLOT_IDENTITY_REQUIRED",
      },
      {
        name: "blank id",
        contribution: () => slotContribution({ id: " \n\t " }),
        code: "SLOT_IDENTITY_REQUIRED",
      },
      {
        name: "non-string plugin id",
        contribution: () =>
          slotContribution({ pluginId: 42 as unknown as string }),
        code: "SLOT_PLUGIN_ID_REQUIRED",
      },
      {
        name: "blank plugin id",
        contribution: () => slotContribution({ pluginId: "\t" }),
        code: "SLOT_PLUGIN_ID_REQUIRED",
      },
      {
        name: "non-string slot",
        contribution: () => slotContribution({ slot: 42 as unknown as string }),
        code: "SLOT_NAME_REQUIRED",
      },
      {
        name: "blank slot",
        contribution: () => slotContribution({ slot: "\n" }),
        code: "SLOT_NAME_REQUIRED",
      },
      {
        name: "non-function component",
        contribution: () =>
          slotContribution({
            component: "not a component" as unknown as RegistryComponent,
          }),
        code: "SLOT_COMPONENT_REQUIRED",
      },
      {
        name: "non-function condition",
        contribution: () =>
          slotContribution({
            when: "not a function" as unknown as SlotCondition,
          }),
        code: "SLOT_CONDITION_REQUIRED",
      },
      {
        name: "id getter",
        contribution: () =>
          slotWithThrowingGetter(
            slotContribution(),
            "id",
            new Error("slot id getter escaped"),
          ),
        code: "SLOT_IDENTITY_REQUIRED",
      },
      {
        name: "slot descriptor trap",
        rawError: slotNameDescriptorError,
        contribution: () =>
          slotProxyWithThrowingDescriptor(
            "slot",
            slotNameDescriptorError,
          ),
        code: "SLOT_NAME_REQUIRED",
      },
    ];

    for (const invalidCase of invalidCases) {
      const slots = createInMemorySlotRegistry();
      const existing = slots.register(
        slotContribution({
          id: "workspace.header.existing",
          pluginId: "workspace",
          slot: "workspace.header",
          component: WorkspaceHeaderSlot,
        }),
      );

      expectSlotRegistryError(
        () => slots.register(invalidCase.contribution()),
        invalidCase.code,
        invalidCase.rawError === undefined
          ? undefined
          : { rawError: invalidCase.rawError },
      );
      expect(slots.get("workspace.header.existing")).toStrictEqual(existing);
      expect(slots.list()).toStrictEqual([existing]);
    }

    const slots = createInMemorySlotRegistry();
    const existing = slots.register(slotContribution());

    expectSlotRegistryError(
      () => slots.list({ pluginId: " " }),
      "SLOT_PLUGIN_ID_REQUIRED",
    );
    expectSlotRegistryError(
      () => slots.list({ slot: "\t" }),
      "SLOT_NAME_REQUIRED",
    );
    expect(slots.list()).toStrictEqual([existing]);
  });
});

function viewDefinition<Props = ViewProps>(
  overrides: Partial<ViewDefinition<Props>> = {},
): ViewDefinition<Props> {
  return {
    id: "workspace.default-view",
    pluginId: "workspace",
    type: "workspace.list",
    title: "Default workspace view",
    component: WorkspaceListPanel as RegistryComponent<Props>,
    accepts: {
      shape: "collection",
      options: {
        density: "comfortable",
      },
    },
    ...overrides,
  };
}

function slotContribution<Props = SlotProps>(
  overrides: Partial<SlotContribution<Props>> = {},
): SlotContribution<Props> {
  return {
    id: "workspace.default-slot",
    pluginId: "workspace",
    slot: "workspace.header",
    component: WorkspaceHeaderSlot as RegistryComponent<Props>,
    ...overrides,
  };
}

function mutateAccepts(accepts: ViewDataShape, value: string): void {
  const mutableAccepts = accepts as {
    supports?: string[];
    options?: {
      density?: string;
    };
  };

  mutableAccepts.supports?.push(value);

  if (mutableAccepts.options !== undefined) {
    mutableAccepts.options.density = value;
  }
}

function mutateSlotContribution(
  contribution: SlotContribution,
  value: string,
): void {
  contribution.pluginId = value;
  contribution.slot = value;
  contribution.order = 999;
}

type RegistryErrorExpectationOptions = {
  rawError?: Error;
};

function expectViewRegistryError(
  action: () => unknown,
  code: ViewRegistryErrorCode,
  options: RegistryErrorExpectationOptions = {},
): void {
  try {
    action();
  } catch (error) {
    if (options.rawError !== undefined) {
      expect(error).not.toBe(options.rawError);
    }

    expect(error).toBeInstanceOf(ViewRegistryError);
    expect((error as { code: ViewRegistryErrorCode }).code).toBe(code);
    return;
  }

  throw new Error("Expected ViewRegistryError");
}

function expectSlotRegistryError(
  action: () => unknown,
  code: SlotRegistryErrorCode,
  options: RegistryErrorExpectationOptions = {},
): void {
  try {
    action();
  } catch (error) {
    if (options.rawError !== undefined) {
      expect(error).not.toBe(options.rawError);
    }

    expect(error).toBeInstanceOf(SlotRegistryError);
    expect((error as { code: SlotRegistryErrorCode }).code).toBe(code);
    return;
  }

  throw new Error("Expected SlotRegistryError");
}

function invalidAcceptsCases(): Array<{
  name: string;
  value: () => ViewDataShape;
  rawError?: Error;
}> {
  const getterError = new Error("accepts getter escaped");
  const proxyError = new Error("accepts proxy escaped");

  return [
    {
      name: "function accepts",
      value: () =>
        ({
          shape: () => "not json",
        }) as unknown as ViewDataShape,
    },
    {
      name: "nested undefined accepts",
      value: () =>
        ({
          options: {
            value: undefined,
          },
        }) as unknown as ViewDataShape,
    },
    {
      name: "NaN accepts",
      value: () =>
        ({
          value: Number.NaN,
        }) as unknown as ViewDataShape,
    },
    {
      name: "Infinity accepts",
      value: () =>
        ({
          value: Number.POSITIVE_INFINITY,
        }) as unknown as ViewDataShape,
    },
    {
      name: "bigint accepts",
      value: () =>
        ({
          value: 1n,
        }) as unknown as ViewDataShape,
    },
    {
      name: "symbol accepts",
      value: () =>
        ({
          value: Symbol("accepts"),
        }) as unknown as ViewDataShape,
    },
    {
      name: "Date accepts",
      value: () =>
        ({
          value: new Date("2026-05-20T00:00:00.000Z"),
        }) as unknown as ViewDataShape,
    },
    {
      name: "sparse array accepts",
      value: () =>
        ({
          values: sparseArray(),
        }) as unknown as ViewDataShape,
    },
    {
      name: "accessor accepts",
      value: () => acceptsWithThrowingGetter(getterError) as ViewDataShape,
      rawError: getterError,
    },
    {
      name: "symbol-key accepts",
      value: () =>
        ({
          [Symbol("hidden")]: true,
        }) as unknown as ViewDataShape,
    },
    {
      name: "non-enumerable accepts",
      value: () =>
        objectWithNonEnumerableProperty(
          { shape: "collection" },
          "hidden",
          true,
        ) as ViewDataShape,
    },
    {
      name: "proxy accepts",
      value: () =>
        proxyWithThrowingOwnKeys(
          { shape: "collection" },
          proxyError,
        ) as ViewDataShape,
      rawError: proxyError,
    },
    {
      name: "cyclic accepts",
      value: () => {
        const cyclic: Record<string, unknown> = {
          shape: "collection",
        };
        cyclic.self = cyclic;

        return cyclic as ViewDataShape;
      },
    },
    {
      name: "class instance accepts",
      value: () => new WorkspaceAccepts() as unknown as ViewDataShape,
    },
  ];
}

function sparseArray(): unknown[] {
  const values: unknown[] = ["first"];
  values[2] = "third";

  return values;
}

function acceptsWithThrowingGetter(rawError: Error): object {
  const accepts = {};

  Object.defineProperty(accepts, "shape", {
    enumerable: true,
    get() {
      throw rawError;
    },
  });

  return accepts;
}

function objectWithNonEnumerableProperty(
  base: Record<string, unknown>,
  key: string,
  value: unknown,
): object {
  const result = { ...base };

  Object.defineProperty(result, key, {
    value,
    enumerable: false,
  });

  return result;
}

function proxyWithThrowingOwnKeys(
  base: Record<string, unknown>,
  rawError: Error,
): object {
  return new Proxy(base, {
    ownKeys() {
      throw rawError;
    },
  });
}

function viewWithThrowingAcceptsGetter<Props>(
  definition: ViewDefinition<Props>,
  rawError: Error,
): ViewDefinition<Props> {
  const result = { ...definition };

  Object.defineProperty(result, "accepts", {
    enumerable: true,
    get() {
      throw rawError;
    },
  });

  return result as ViewDefinition<Props>;
}

function viewWithThrowingGetter(
  key: keyof ViewDefinition,
  rawError: Error,
): ViewDefinition {
  const result = { ...viewDefinition() };

  Object.defineProperty(result, key, {
    enumerable: true,
    get() {
      throw rawError;
    },
  });

  return result as ViewDefinition;
}

function viewProxyWithThrowingDescriptor(
  key: keyof ViewDefinition,
  rawError: Error,
): ViewDefinition {
  return new Proxy(viewDefinition(), {
    getOwnPropertyDescriptor(target, property) {
      if (property === key) {
        throw rawError;
      }

      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  }) as ViewDefinition;
}

function viewProxyWithThrowingGetForAllProperties<Props>(
  definition: ViewDefinition<Props>,
  getTrap: NonNullable<ProxyHandler<ViewDefinition<Props>>["get"]>,
): ViewDefinition<Props> {
  return new Proxy(definition, {
    get: getTrap,
  });
}

function slotWithThrowingGetter<Props>(
  contribution: SlotContribution<Props>,
  key: keyof SlotContribution,
  rawError: Error,
): SlotContribution<Props> {
  const result = { ...contribution };

  Object.defineProperty(result, key, {
    enumerable: true,
    get() {
      throw rawError;
    },
  });

  return result as SlotContribution<Props>;
}

function slotProxyWithThrowingDescriptor(
  key: keyof SlotContribution,
  rawError: Error,
): SlotContribution {
  return new Proxy(slotContribution(), {
    getOwnPropertyDescriptor(target, property) {
      if (property === key) {
        throw rawError;
      }

      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  }) as SlotContribution;
}

function slotProxyWithThrowingGetForAllProperties<Props>(
  contribution: SlotContribution<Props>,
  getTrap: NonNullable<ProxyHandler<SlotContribution<Props>>["get"]>,
): SlotContribution<Props> {
  return new Proxy(contribution, {
    get: getTrap,
  });
}

class WorkspaceAccepts {
  readonly shape = "collection";
}
