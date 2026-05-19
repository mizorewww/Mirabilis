import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { EventStoreError, createInMemoryEventStore } from "../core";
import type {
  AppendEventInput,
  AppEvent,
  CreateInMemoryEventStoreOptions,
  EventStore,
  ListEventsOptions,
} from "../core";

const firstInstant = "2026-05-19T10:00:00.000Z";
const secondInstant = "2026-05-19T10:05:00.000Z";
const thirdInstant = "2026-05-19T10:10:00.000Z";
const fourthInstant = "2026-05-19T10:15:00.000Z";

describe("in-memory Event Store", () => {
  it("exports the public Event Store API from the Core entrypoint", () => {
    expect(createInMemoryEventStore).toEqual(expect.any(Function));
    expect(EventStoreError).toEqual(expect.any(Function));
    expectTypeOf<EventStore>().toEqualTypeOf<{
      append(input: AppendEventInput): AppEvent;
      list(options?: ListEventsOptions): AppEvent[];
    }>();
    expectTypeOf<AppendEventInput>().toEqualTypeOf<{
      pageId?: string;
      namespace: string;
      type: string;
      payload: unknown;
      sourcePluginId: string;
    }>();
    expectTypeOf<ListEventsOptions>().toEqualTypeOf<{
      pageId?: string;
      namespace?: string;
    }>();
    expectTypeOf<CreateInMemoryEventStoreOptions>().toEqualTypeOf<{
      createId?: () => string;
      now?: () => string;
    }>();
    expectTypeOf<AppEvent["payload"]>().toEqualTypeOf<unknown>();
  });

  it("appends page-bound and global events with injected ids and timestamps", () => {
    const store = createStore({
      ids: ["event_profile", "event_workspace", "event_review"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });

    const profileEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "density", value: "compact" },
        sourcePluginId: "profile-plugin",
      }),
    );
    const workspaceEvent = store.append(
      eventInput({
        namespace: "workspace",
        type: "opened",
        payload: { area: "overview" },
        sourcePluginId: "workspace-plugin",
      }),
    );
    const reviewEvent = store.append(
      eventInput({
        pageId: "page_beta",
        namespace: "review",
        type: "requested",
        payload: null,
        sourcePluginId: "review-plugin",
      }),
    );

    expect(profileEvent).toStrictEqual({
      id: "event_profile",
      pageId: "page_alpha",
      namespace: "profile",
      type: "preference.changed",
      payload: { field: "density", value: "compact" },
      sourcePluginId: "profile-plugin",
      createdAt: firstInstant,
    });
    expect(workspaceEvent).toStrictEqual({
      id: "event_workspace",
      namespace: "workspace",
      type: "opened",
      payload: { area: "overview" },
      sourcePluginId: "workspace-plugin",
      createdAt: secondInstant,
    });
    expect(workspaceEvent).not.toHaveProperty("pageId");
    expect(reviewEvent.createdAt).toBe(thirdInstant);
    expect(store.list()).toStrictEqual([
      profileEvent,
      workspaceEvent,
      reviewEvent,
    ]);
    expect(store.list().map((event) => event.id)).toStrictEqual([
      "event_profile",
      "event_workspace",
      "event_review",
    ]);
  });

  it("keeps duplicate event identities append-only in append order", () => {
    const store = createStore({
      ids: ["event_profile_first", "event_profile_second"],
      instants: [firstInstant, secondInstant],
    });

    const firstEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "density", value: "compact" },
        sourcePluginId: "profile-plugin",
      }),
    );
    const secondEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "theme", value: "contrast" },
        sourcePluginId: "settings-plugin",
      }),
    );

    expect(firstEvent).toStrictEqual({
      id: "event_profile_first",
      pageId: "page_alpha",
      namespace: "profile",
      type: "preference.changed",
      payload: { field: "density", value: "compact" },
      sourcePluginId: "profile-plugin",
      createdAt: firstInstant,
    });
    expect(secondEvent).toStrictEqual({
      id: "event_profile_second",
      pageId: "page_alpha",
      namespace: "profile",
      type: "preference.changed",
      payload: { field: "theme", value: "contrast" },
      sourcePluginId: "settings-plugin",
      createdAt: secondInstant,
    });
    expect(store.list()).toStrictEqual([firstEvent, secondEvent]);
    expect(
      store.list({ pageId: "page_alpha", namespace: "profile" }),
    ).toStrictEqual([firstEvent, secondEvent]);
  });

  it("creates usable events with default ids and timestamps", () => {
    const store = createInMemoryEventStore();

    const created = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "theme", value: "light" },
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(created.id).toMatch(/^event_/);
    expectValidIsoInstant(created.createdAt);
    expect(store.list()).toStrictEqual([created]);
  });

  it("creates default ids from getRandomValues when randomUUID is unavailable", () => {
    const deterministicBytes = [
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
      0x0c, 0x0d, 0x0e, 0x0f,
    ];

    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.set(deterministicBytes);
        return bytes;
      },
    });

    try {
      const store = createInMemoryEventStore({
        now: sequence("instant", [firstInstant]),
      });

      const created = store.append(
        eventInput({
          namespace: "workspace",
          type: "opened",
          payload: { area: "overview" },
          sourcePluginId: "workspace-plugin",
        }),
      );

      expect(created.id).toBe("event_000102030405060708090a0b0c0d0e0f");
      expect(created.createdAt).toBe(firstInstant);
      expectValidIsoInstant(created.createdAt);
      expect(store.list()).toStrictEqual([created]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lists events by exact page and namespace filters", () => {
    const store = createStore({
      ids: [
        "event_alpha_profile",
        "event_global_profile",
        "event_beta_profile",
        "event_alpha_settings",
      ],
      instants: [firstInstant, secondInstant, thirdInstant, fourthInstant],
    });
    const alphaProfile = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "density", value: "compact" },
        sourcePluginId: "profile-plugin",
      }),
    );
    const globalProfile = store.append(
      eventInput({
        namespace: "profile",
        type: "preference.defaults-loaded",
        payload: { count: 2 },
        sourcePluginId: "profile-plugin",
      }),
    );
    const betaProfile = store.append(
      eventInput({
        pageId: "page_beta",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "theme", value: "contrast" },
        sourcePluginId: "profile-plugin",
      }),
    );
    const alphaSettings = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "settings",
        type: "saved",
        payload: { section: "display" },
        sourcePluginId: "settings-plugin",
      }),
    );

    expect(store.list()).toStrictEqual([
      alphaProfile,
      globalProfile,
      betaProfile,
      alphaSettings,
    ]);
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([
      alphaProfile,
      alphaSettings,
    ]);
    expect(store.list({ pageId: "page_beta" })).toStrictEqual([betaProfile]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([
      alphaProfile,
      globalProfile,
      betaProfile,
    ]);
    expect(
      store.list({ pageId: "page_alpha", namespace: "profile" }),
    ).toStrictEqual([alphaProfile]);
    expect(store.list({ pageId: "page_missing" })).toStrictEqual([]);
    expect(store.list({ namespace: "workspace" })).toStrictEqual([]);
  });

  it("preserves significant whitespace in exact identities and filters", () => {
    const store = createStore({
      ids: ["event_spaced", "event_plain"],
      instants: [firstInstant, secondInstant],
    });

    const spacedEvent = store.append(
      eventInput({
        pageId: " page_alpha ",
        namespace: " profile ",
        type: " preference.changed ",
        payload: { field: "layout" },
        sourcePluginId: "profile-plugin",
      }),
    );
    const plainEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "layout" },
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(spacedEvent.pageId).toBe(" page_alpha ");
    expect(spacedEvent.namespace).toBe(" profile ");
    expect(spacedEvent.type).toBe(" preference.changed ");
    expect(plainEvent.pageId).toBe("page_alpha");
    expect(plainEvent.namespace).toBe("profile");
    expect(plainEvent.type).toBe("preference.changed");
    expect(store.list({ pageId: " page_alpha " })).toStrictEqual([
      spacedEvent,
    ]);
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([plainEvent]);
    expect(store.list({ namespace: " profile " })).toStrictEqual([
      spacedEvent,
    ]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([plainEvent]);
    expect(
      store.list({ pageId: " page_alpha ", namespace: " profile " }),
    ).toStrictEqual([spacedEvent]);
  });

  it("rejects blank identity fields and blank filters", () => {
    const store = createStore({
      ids: numberedValues("event_identity", 10),
      instants: numberedInstants(10),
    });
    const invalidInputs: AppendEventInput[] = [
      eventInput({
        pageId: "page_alpha",
        namespace: "",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
      eventInput({
        pageId: "page_alpha",
        namespace: "   ",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "   ",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
      eventInput({
        pageId: "",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
      eventInput({
        pageId: "   ",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
    ];

    for (const invalidInput of invalidInputs) {
      expectEventStoreError(
        () => store.append(invalidInput),
        "EVENT_IDENTITY_REQUIRED",
      );
    }

    expectEventStoreError(
      () => store.list({ pageId: "" }),
      "EVENT_IDENTITY_REQUIRED",
    );
    expectEventStoreError(
      () => store.list({ pageId: "   " }),
      "EVENT_IDENTITY_REQUIRED",
    );
    expectEventStoreError(
      () => store.list({ namespace: "" }),
      "EVENT_IDENTITY_REQUIRED",
    );
    expectEventStoreError(
      () => store.list({ namespace: "   " }),
      "EVENT_IDENTITY_REQUIRED",
    );
    expect(store.list()).toStrictEqual([]);
  });

  it("requires sourcePluginId and stores it trimmed", () => {
    const store = createStore({
      ids: ["event_profile"],
      instants: [firstInstant],
    });

    expectEventStoreError(
      () =>
        store.append(
          eventInput({
            pageId: "page_alpha",
            namespace: "profile",
            type: "preference.changed",
            payload: null,
            sourcePluginId: "",
          }),
        ),
      "EVENT_SOURCE_PLUGIN_REQUIRED",
    );
    expectEventStoreError(
      () =>
        store.append(
          eventInput({
            pageId: "page_alpha",
            namespace: "profile",
            type: "preference.changed",
            payload: null,
            sourcePluginId: "   ",
          }),
        ),
      "EVENT_SOURCE_PLUGIN_REQUIRED",
    );

    const created = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: " profile-plugin ",
      }),
    );

    expect(created.sourcePluginId).toBe("profile-plugin");
    expect(store.list()).toStrictEqual([created]);
  });

  it("rejects runtime non-string identities, sources, and filters before trimming", () => {
    const appendCases: Array<{
      invalidFields: Partial<AppendEventInput>;
      expectedCode: EventStoreError["code"];
    }> = [
      {
        invalidFields: {
          namespace: nonStringWithInheritedTrim("profile"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          namespace: nonStringWithOwnTrim("profile"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          type: nonStringWithInheritedTrim("preference.changed"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          type: nonStringWithOwnTrim("preference.changed"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          pageId: nonStringWithInheritedTrim("page_alpha"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          pageId: nonStringWithOwnTrim("page_alpha"),
        },
        expectedCode: "EVENT_IDENTITY_REQUIRED",
      },
      {
        invalidFields: {
          sourcePluginId: nonStringWithInheritedTrim("profile-plugin"),
        },
        expectedCode: "EVENT_SOURCE_PLUGIN_REQUIRED",
      },
      {
        invalidFields: {
          sourcePluginId: nonStringWithOwnTrim("profile-plugin"),
        },
        expectedCode: "EVENT_SOURCE_PLUGIN_REQUIRED",
      },
    ];

    appendCases.forEach((appendCase, index) => {
      const store = createStore({
        ids: [`event_runtime_string_${index + 1}`],
        instants: [firstInstant],
      });

      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: "preference.changed",
              payload: null,
              sourcePluginId: "profile-plugin",
              ...appendCase.invalidFields,
            } as AppendEventInput),
          ),
        appendCase.expectedCode,
      );
      expect(store.list()).toStrictEqual([]);
    });

    const store = createStore({
      ids: ["event_existing"],
      instants: [firstInstant],
    });
    const existing = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
    );
    const filterCases: ListEventsOptions[] = [
      { pageId: nonStringWithInheritedTrim("page_alpha") },
      { pageId: nonStringWithOwnTrim("page_alpha") },
      { namespace: nonStringWithInheritedTrim("profile") },
      { namespace: nonStringWithOwnTrim("profile") },
    ];

    for (const filterCase of filterCases) {
      expectEventStoreError(
        () => store.list(filterCase),
        "EVENT_IDENTITY_REQUIRED",
      );
      expect(store.list()).toStrictEqual([existing]);
    }
  });

  it("rejects hostile non-string list filters with typed errors", () => {
    const store = createStore({
      ids: ["event_existing"],
      instants: [firstInstant],
    });
    const existing = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
    );
    const rawToStringError = new Error("raw filter toString executed");
    const rawValueOfError = { reason: "raw filter valueOf executed" };
    const filterCases: Array<{
      options: ListEventsOptions;
      rawError?: unknown;
      rejectTypeError?: boolean;
    }> = [
      {
        options: { pageId: Symbol("page_alpha") as unknown as string },
        rejectTypeError: true,
      },
      {
        options: { namespace: Symbol("profile") as unknown as string },
        rejectTypeError: true,
      },
      {
        options: { pageId: nonStringWithThrowingToString(rawToStringError) },
        rawError: rawToStringError,
      },
      {
        options: {
          namespace: nonStringWithThrowingValueOf(rawValueOfError),
        },
        rawError: rawValueOfError,
      },
    ];

    for (const filterCase of filterCases) {
      expectEventStoreError(
        () => store.list(filterCase.options),
        "EVENT_IDENTITY_REQUIRED",
        {
          rawError: filterCase.rawError,
          rejectTypeError: filterCase.rejectTypeError,
        },
      );
      expect(store.list()).toStrictEqual([existing]);
    }
  });

  it("normalizes hostile pageId list option property traps to typed errors", () => {
    const store = createStore({
      ids: ["event_existing"],
      instants: [firstInstant],
    });
    const existing = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
    );
    const rawPageIdTrapError = new Error("raw pageId option get trap");
    const options = new Proxy({} as ListEventsOptions, {
      get(target, property, receiver) {
        if (property === "pageId") {
          throw rawPageIdTrapError;
        }

        return Reflect.get(target, property, receiver);
      },
    });

    expectEventStoreError(
      () => store.list(options),
      "EVENT_IDENTITY_REQUIRED",
      { rawError: rawPageIdTrapError },
    );
    expect(store.list()).toStrictEqual([existing]);
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([existing]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([existing]);
  });

  it("normalizes hostile namespace list option property traps to typed errors", () => {
    const store = createStore({
      ids: ["event_existing"],
      instants: [firstInstant],
    });
    const existing = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: null,
        sourcePluginId: "profile-plugin",
      }),
    );
    const rawNamespaceTrapError = new Error("raw namespace option get trap");
    const options = new Proxy({} as ListEventsOptions, {
      get(target, property, receiver) {
        if (property === "namespace") {
          throw rawNamespaceTrapError;
        }

        return Reflect.get(target, property, receiver);
      },
    });

    expectEventStoreError(
      () => store.list(options),
      "EVENT_IDENTITY_REQUIRED",
      { rawError: rawNamespaceTrapError },
    );
    expect(store.list()).toStrictEqual([existing]);
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([existing]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([existing]);
  });

  it("accepts JSON-compatible runtime payloads while keeping payload typed unknown", () => {
    const acceptedPayloads: Array<{ label: string; payload: unknown }> = [
      { label: "string", payload: "compact" },
      { label: "number", payload: 12 },
      { label: "boolean", payload: true },
      { label: "null", payload: null },
      { label: "array", payload: ["compact", { pinned: true }] },
      {
        label: "object",
        payload: { state: "ready", revisions: [1, 2] },
      },
    ];
    const store = createStore({
      ids: numberedValues("event_payload", acceptedPayloads.length),
      instants: numberedInstants(acceptedPayloads.length),
    });

    for (const acceptedPayload of acceptedPayloads) {
      const created = store.append(
        eventInput({
          pageId: "page_alpha",
          namespace: "profile",
          type: `preference.${acceptedPayload.label}`,
          payload: acceptedPayload.payload,
          sourcePluginId: "profile-plugin",
        }),
      );

      expect(created.payload).toStrictEqual(acceptedPayload.payload);
      expectTypeOf<typeof created.payload>().toEqualTypeOf<unknown>();
    }

    expect(store.list().map((event) => event.payload)).toStrictEqual(
      acceptedPayloads.map((acceptedPayload) => acceptedPayload.payload),
    );
  });

  it("rejects non-JSON-compatible runtime payloads with typed errors", () => {
    const cyclicPayload: Record<string, unknown> = { label: "cycle" };
    cyclicPayload.self = cyclicPayload;
    const sparseArray: unknown[] = [];
    sparseArray[1] = "missing-zero";
    const arrayWithStringProperty = ["compact"] as unknown[] & {
      eventState?: string;
    };
    arrayWithStringProperty.eventState = "hidden";
    const arrayWithSymbolProperty = ["compact"];
    Object.defineProperty(arrayWithSymbolProperty, Symbol("event"), {
      enumerable: true,
      value: "hidden",
    });
    const objectWithSymbolKey: Record<string, unknown> = { visible: true };
    Object.defineProperty(objectWithSymbolKey, Symbol("event"), {
      enumerable: true,
      value: "hidden",
    });

    class PreferenceInstance {
      readonly mode = "custom";
    }

    const invalidPayloads: Array<{ label: string; payload: unknown }> = [
      { label: "undefined", payload: undefined },
      { label: "function", payload: () => "value" },
      { label: "symbol", payload: Symbol("event") },
      { label: "bigint", payload: 1n },
      { label: "nan", payload: Number.NaN },
      { label: "infinity", payload: Number.POSITIVE_INFINITY },
      { label: "cycle", payload: cyclicPayload },
      { label: "date", payload: new Date(firstInstant) },
      { label: "map", payload: new Map([["density", "compact"]]) },
      { label: "set", payload: new Set(["compact"]) },
      { label: "classInstance", payload: new PreferenceInstance() },
      { label: "sparseArray", payload: sparseArray },
      { label: "arrayWithStringProperty", payload: arrayWithStringProperty },
      { label: "arrayWithSymbolProperty", payload: arrayWithSymbolProperty },
      { label: "objectWithSymbolKey", payload: objectWithSymbolKey },
    ];
    const store = createStore({
      ids: numberedValues("event_invalid_payload", invalidPayloads.length),
      instants: numberedInstants(invalidPayloads.length),
    });

    for (const invalidPayload of invalidPayloads) {
      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: `preference.${invalidPayload.label}`,
              payload: invalidPayload.payload,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("rejects nested non-JSON-compatible payload values with typed errors", () => {
    const invalidPayloads: Array<{ label: string; payload: unknown }> = [
      { label: "nestedUndefined", payload: { value: undefined } },
      {
        label: "nestedFunction",
        payload: { nested: { value: () => null } },
      },
      { label: "arrayUndefined", payload: [undefined] },
      { label: "arrayNestedBigint", payload: [{ value: 1n }] },
      {
        label: "nestedSymbol",
        payload: { nested: [{ value: Symbol("event") }] },
      },
      {
        label: "nestedInfinity",
        payload: { nested: { values: [Number.POSITIVE_INFINITY] } },
      },
    ];
    const store = createStore({
      ids: numberedValues(
        "event_nested_invalid_payload",
        invalidPayloads.length,
      ),
      instants: numberedInstants(invalidPayloads.length),
    });

    for (const invalidPayload of invalidPayloads) {
      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: `preference.${invalidPayload.label}`,
              payload: invalidPayload.payload,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("rejects accessor payload descriptors without executing getters", () => {
    const accessorPayloads = [
      createObjectGetterPayload(),
      createArrayGetterPayload(),
    ];

    accessorPayloads.forEach((accessorPayload, index) => {
      const store = createStore({
        ids: [`event_accessor_payload_${index + 1}`],
        instants: [firstInstant],
      });

      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: `preference.accessor.${index + 1}`,
              payload: accessorPayload.payload,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
      );
      expect(accessorPayload.getterCalls()).toBe(0);
      expect(store.list()).toStrictEqual([]);
    });
  });

  it("normalizes proxy payload reflection failures to typed errors", () => {
    const rawGetPrototypeOfError = new Error("raw getPrototypeOf trap");
    const rawOwnKeysError = new Error("raw ownKeys trap");
    const rawGetOwnPropertyDescriptorError = new Error(
      "raw getOwnPropertyDescriptor trap",
    );
    const proxyPayloads: Array<{
      label: string;
      payload: unknown;
      rawError: unknown;
    }> = [
      {
        label: "getPrototypeOf",
        payload: new Proxy(
          {},
          {
            getPrototypeOf() {
              throw rawGetPrototypeOfError;
            },
          },
        ),
        rawError: rawGetPrototypeOfError,
      },
      {
        label: "ownKeys",
        payload: new Proxy(
          {},
          {
            ownKeys() {
              throw rawOwnKeysError;
            },
          },
        ),
        rawError: rawOwnKeysError,
      },
      {
        label: "getOwnPropertyDescriptor",
        payload: new Proxy(
          { value: "compact" },
          {
            ownKeys() {
              return ["value"];
            },
            getOwnPropertyDescriptor() {
              throw rawGetOwnPropertyDescriptorError;
            },
          },
        ),
        rawError: rawGetOwnPropertyDescriptorError,
      },
    ];

    proxyPayloads.forEach((proxyPayload, index) => {
      const store = createStore({
        ids: [`event_proxy_payload_${index + 1}`],
        instants: [firstInstant],
      });

      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: `preference.proxy.${proxyPayload.label}`,
              payload: proxyPayload.payload,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
        { rawError: proxyPayload.rawError },
      );
      expect(store.list()).toStrictEqual([]);
    });
  });

  it("surfaces deeply nested payload validation failures as typed errors", () => {
    const store = createStore({
      ids: ["event_deep_payload"],
      instants: [firstInstant],
    });

    expectEventStoreError(
      () =>
        store.append(
          eventInput({
            pageId: "page_alpha",
            namespace: "profile",
            type: "preference.deep",
            payload: createDeepPayload(50_000),
            sourcePluginId: "profile-plugin",
          }),
        ),
      "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
    );
    expect(store.list()).toStrictEqual([]);
  });

  it("uses defensive copies at input, append return, and list boundaries", () => {
    const store = createStore({
      ids: ["event_profile", "event_settings"],
      instants: [firstInstant, secondInstant],
    });
    const inputPayload = {
      preferences: {
        accents: ["blue"],
      },
    };
    const profileEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: inputPayload,
        sourcePluginId: "profile-plugin",
      }),
    );
    const expectedProfileEvent: AppEvent = {
      id: "event_profile",
      pageId: "page_alpha",
      namespace: "profile",
      type: "preference.changed",
      payload: {
        preferences: {
          accents: ["blue"],
        },
      },
      sourcePluginId: "profile-plugin",
      createdAt: firstInstant,
    };

    inputPayload.preferences.accents[0] = "changed-input";
    expect(store.list()).toStrictEqual([expectedProfileEvent]);

    mutateFirstAccent(profileEvent, "changed-append-return");
    expect(store.list()).toStrictEqual([expectedProfileEvent]);

    const listedEvents = store.list();
    mutateFirstAccent(listedEvents[0]!, "changed-list-return");
    listedEvents.push({
      id: "event_extra",
      pageId: "page_extra",
      namespace: "profile",
      type: "preference.changed",
      payload: { preferences: { accents: ["extra"] } },
      sourcePluginId: "profile-plugin",
      createdAt: fourthInstant,
    });
    expect(store.list()).toStrictEqual([expectedProfileEvent]);

    const settingsEvent = store.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "settings",
        type: "saved",
        payload: { preferences: { accents: ["green"] } },
        sourcePluginId: "settings-plugin",
      }),
    );
    const filteredEvents = store.list({ namespace: "profile" });
    mutateFirstAccent(filteredEvents[0]!, "changed-filtered-list-return");
    filteredEvents.splice(0, 1);
    expect(store.list({ namespace: "profile" })).toStrictEqual([
      expectedProfileEvent,
    ]);
    expect(store.list()).toStrictEqual([expectedProfileEvent, settingsEvent]);
  });

  it("leaves prior events unchanged after rejected appends and id collisions", () => {
    const rejectedStore = createStore({
      ids: ["event_existing", "event_unused"],
      instants: [firstInstant, secondInstant],
    });
    const existing = rejectedStore.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "theme", value: "light" },
        sourcePluginId: "profile-plugin",
      }),
    );

    expectEventStoreError(
      () =>
        rejectedStore.append(
          eventInput({
            pageId: "page_alpha",
            namespace: "profile",
            type: "preference.invalid",
            payload: Number.NaN,
            sourcePluginId: "profile-plugin",
          }),
        ),
      "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
    );
    expect(rejectedStore.list()).toStrictEqual([existing]);

    const collisionStore = createStore({
      ids: ["event_existing", "event_existing"],
      instants: [firstInstant, secondInstant],
    });
    const collisionExisting = collisionStore.append(
      eventInput({
        pageId: "page_alpha",
        namespace: "profile",
        type: "preference.changed",
        payload: { field: "theme", value: "light" },
        sourcePluginId: "profile-plugin",
      }),
    );

    expectEventStoreError(
      () =>
        collisionStore.append(
          eventInput({
            pageId: "page_beta",
            namespace: "profile",
            type: "preference.changed",
            payload: { field: "theme", value: "contrast" },
            sourcePluginId: "profile-plugin",
          }),
        ),
      "EVENT_ID_COLLISION",
    );
    expect(collisionStore.list()).toStrictEqual([collisionExisting]);
  });

  it("surfaces clone failures as typed errors without storing the event", () => {
    vi.stubGlobal("structuredClone", () => {
      throw new DOMException("Cannot clone", "DataCloneError");
    });

    try {
      const store = createStore({
        ids: ["event_profile"],
        instants: [firstInstant],
      });

      expectEventStoreError(
        () =>
          store.append(
            eventInput({
              pageId: "page_alpha",
              namespace: "profile",
              type: "preference.changed",
              payload: { field: "density", value: "compact" },
              sourcePluginId: "profile-plugin",
            }),
          ),
        "EVENT_CLONE_FAILED",
      );
      expect(store.list()).toStrictEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function createStore({
  ids,
  instants,
}: {
  ids: string[];
  instants: string[];
}): EventStore {
  return createInMemoryEventStore({
    createId: sequence("id", ids),
    now: sequence("instant", instants),
  });
}

function eventInput(input: AppendEventInput): AppendEventInput {
  return input;
}

function sequence(label: string, values: string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error(`${label} sequence exhausted`);
    }

    index += 1;
    return value;
  };
}

function numberedValues(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `${prefix}_${index + 1}`,
  );
}

function numberedInstants(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => {
    return `2026-05-19T11:${String(index).padStart(2, "0")}:00.000Z`;
  });
}

function nonStringWithInheritedTrim(value: string): string {
  const runtimeValue = Object.create({
    trim() {
      return value;
    },
  }) as Record<string, unknown>;
  runtimeValue.value = value;

  return runtimeValue as unknown as string;
}

function nonStringWithOwnTrim(value: string): string {
  return {
    trim() {
      return value;
    },
    value,
  } as unknown as string;
}

function nonStringWithThrowingToString(rawError: unknown): string {
  return {
    toString() {
      throw rawError;
    },
    valueOf() {
      throw rawError;
    },
  } as unknown as string;
}

function nonStringWithThrowingValueOf(rawError: unknown): string {
  return {
    toString() {
      return {};
    },
    valueOf() {
      throw rawError;
    },
  } as unknown as string;
}

function createObjectGetterPayload(): {
  payload: unknown;
  getterCalls: () => number;
} {
  let getterCalls = 0;
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, "value", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("object payload getter executed");
    },
  });

  return {
    payload,
    getterCalls: () => getterCalls,
  };
}

function createArrayGetterPayload(): {
  payload: unknown;
  getterCalls: () => number;
} {
  let getterCalls = 0;
  const payload: unknown[] = [];

  Object.defineProperty(payload, "0", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("array payload getter executed");
    },
  });

  return {
    payload,
    getterCalls: () => getterCalls,
  };
}

function createDeepPayload(depth: number): unknown {
  let payload: unknown = { value: "leaf" };

  for (let index = 0; index < depth; index += 1) {
    payload = { nested: payload };
  }

  return payload;
}

function expectValidIsoInstant(value: string): void {
  const parsedInstant = Date.parse(value);

  expect(Number.isNaN(parsedInstant)).toBe(false);
  expect(new Date(parsedInstant).toISOString()).toBe(value);
}

function mutateFirstAccent(event: AppEvent, value: string): void {
  const payload = event.payload;

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("preferences" in payload)
  ) {
    throw new Error("Expected event payload with preferences");
  }

  const preferences = payload.preferences;

  if (
    typeof preferences !== "object" ||
    preferences === null ||
    !("accents" in preferences) ||
    !Array.isArray(preferences.accents)
  ) {
    throw new Error("Expected event payload with preference accents");
  }

  preferences.accents[0] = value;
}

type EventStoreErrorExpectationOptions = {
  rawError?: unknown;
  rejectTypeError?: boolean;
};

function expectEventStoreError(
  action: () => unknown,
  code: EventStoreError["code"],
  options: EventStoreErrorExpectationOptions = {},
): void {
  try {
    action();
  } catch (error) {
    if (options.rawError !== undefined) {
      expect(error).not.toBe(options.rawError);
    }

    if (options.rejectTypeError === true) {
      expect(error).not.toBeInstanceOf(TypeError);
    }

    expect(error).toBeInstanceOf(EventStoreError);

    if (error instanceof EventStoreError) {
      expect(error.code).toBe(code);
    }

    return;
  }

  throw new Error("Expected EventStoreError");
}
