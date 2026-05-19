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

function expectEventStoreError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(EventStoreError);

    if (error instanceof EventStoreError) {
      expect(error.code).toBe(code);
    }

    return;
  }

  throw new Error("Expected EventStoreError");
}
