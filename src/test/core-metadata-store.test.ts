import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { MetadataStoreError, createInMemoryMetadataStore } from "../core";
import type {
  ListMetadataOptions,
  MetadataJsonValue,
  MetadataRecord,
  MetadataStore,
  SetMetadataInput,
} from "../core";
import type {
  MetadataJsonValue as MetadataJsonValueFromTypesBarrel,
} from "../core/types";

const firstInstant = "2026-05-19T10:00:00.000Z";
const secondInstant = "2026-05-19T10:05:00.000Z";
const thirdInstant = "2026-05-19T10:10:00.000Z";
const fourthInstant = "2026-05-19T10:15:00.000Z";

type MetadataIdentity = Pick<
  MetadataRecord,
  "pageId" | "namespace" | "key"
>;

describe("in-memory Metadata Store", () => {
  it("exports the public Metadata Store API from the Core entrypoint", () => {
    expect(createInMemoryMetadataStore).toEqual(expect.any(Function));
    expect(MetadataStoreError).toEqual(expect.any(Function));
    expectTypeOf<MetadataStore>().toMatchObjectType<{
      set(input: SetMetadataInput): MetadataRecord;
      get(pageId: string, namespace: string, key: string): MetadataRecord;
      list(options?: ListMetadataOptions): MetadataRecord[];
      delete(pageId: string, namespace: string, key: string): MetadataRecord;
    }>();
    expectTypeOf<ListMetadataOptions>().toEqualTypeOf<{
      pageId?: string;
      namespace?: string;
      key?: string;
    }>();
    expectTypeOf<MetadataJsonValueFromTypesBarrel>().toEqualTypeOf<
      MetadataJsonValue
    >();

    const jsonObject = {
      review: { state: "ready", revision: 2 },
      labels: ["profile", "settings"],
    } satisfies MetadataJsonValue;
    const jsonArray = ["compact", { pinned: true }] satisfies MetadataJsonValue;

    expect(jsonObject.review.state).toBe("ready");
    expect(jsonArray).toHaveLength(2);
  });

  it("sets, gets, lists, and deletes metadata by exact identity", () => {
    const store = createStore({
      ids: ["metadata_alpha"],
      instants: [firstInstant],
    });
    const input = metadataInput({
      pageId: "page_alpha",
      namespace: "profile",
      key: "displayName",
      value: "Ada",
      valueType: "string",
      sourcePluginId: "profile-plugin",
    });

    const created = store.set(input);

    expect(created).toStrictEqual({
      id: "metadata_alpha",
      pageId: "page_alpha",
      namespace: "profile",
      key: "displayName",
      value: "Ada",
      valueType: "string",
      sourcePluginId: "profile-plugin",
      createdAt: firstInstant,
      updatedAt: firstInstant,
    });
    expect(store.get("page_alpha", "profile", "displayName")).toStrictEqual(
      created,
    );
    expect(store.list()).toStrictEqual([created]);
    expect(store.delete("page_alpha", "profile", "displayName")).toStrictEqual(
      created,
    );
    expect(store.list()).toStrictEqual([]);
    expectMetadataStoreError(
      () => store.get("page_alpha", "profile", "displayName"),
      "METADATA_NOT_FOUND",
      identity("page_alpha", "profile", "displayName"),
    );
  });

  it("preserves significant whitespace in exact identities and list filters", () => {
    const store = createStore({
      ids: ["metadata_spaced_key", "metadata_plain_key"],
      instants: [firstInstant, secondInstant],
    });

    const spacedKey = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: " displayName ",
        value: "Ada with spaces",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const plainKey = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "displayName",
        value: "Ada plain",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(spacedKey.key).toBe(" displayName ");
    expect(plainKey.key).toBe("displayName");
    expect(store.get("page_alpha", "profile", " displayName ")).toStrictEqual(
      spacedKey,
    );
    expect(store.get("page_alpha", "profile", "displayName")).toStrictEqual(
      plainKey,
    );
    expect(store.list({ key: " displayName " })).toStrictEqual([spacedKey]);
    expect(store.list({ key: "displayName" })).toStrictEqual([plainKey]);
    expect(
      store.list({ pageId: "page_alpha", namespace: "profile" }),
    ).toStrictEqual([spacedKey, plainKey]);
  });

  it("preserves significant whitespace in page ids and namespaces for exact filters", () => {
    const store = createStore({
      ids: [
        "metadata_spaced_page",
        "metadata_plain_page",
        "metadata_spaced_namespace",
        "metadata_plain_namespace",
      ],
      instants: [firstInstant, secondInstant, thirdInstant, fourthInstant],
    });

    const spacedPageId = store.set(
      metadataInput({
        pageId: " page_alpha ",
        namespace: "pageFilter",
        key: "theme",
        value: "spaced page",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const plainPageId = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "pageFilter",
        key: "theme",
        value: "plain page",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const spacedNamespace = store.set(
      metadataInput({
        pageId: "page_namespace",
        namespace: " profile ",
        key: "theme",
        value: "spaced namespace",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const plainNamespace = store.set(
      metadataInput({
        pageId: "page_namespace",
        namespace: "profile",
        key: "theme",
        value: "plain namespace",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(spacedPageId.pageId).toBe(" page_alpha ");
    expect(plainPageId.pageId).toBe("page_alpha");
    expect(spacedNamespace.namespace).toBe(" profile ");
    expect(plainNamespace.namespace).toBe("profile");
    expect(store.get(" page_alpha ", "pageFilter", "theme")).toStrictEqual(
      spacedPageId,
    );
    expect(store.get("page_alpha", "pageFilter", "theme")).toStrictEqual(
      plainPageId,
    );
    expect(store.get("page_namespace", " profile ", "theme")).toStrictEqual(
      spacedNamespace,
    );
    expect(store.get("page_namespace", "profile", "theme")).toStrictEqual(
      plainNamespace,
    );
    expect(store.list({ pageId: " page_alpha " })).toStrictEqual([
      spacedPageId,
    ]);
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([plainPageId]);
    expect(store.list({ namespace: " profile " })).toStrictEqual([
      spacedNamespace,
    ]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([
      plainNamespace,
    ]);
    expect(
      store.list({ pageId: " page_alpha ", namespace: "pageFilter" }),
    ).toStrictEqual([spacedPageId]);
    expect(
      store.list({ pageId: "page_namespace", namespace: " profile " }),
    ).toStrictEqual([spacedNamespace]);
  });

  it("creates usable records with default ids and timestamps", () => {
    const store = createInMemoryMetadataStore();

    const created = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "nickname",
        value: "Default",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(created.id).toMatch(/^metadata_/);
    expect(created.createdAt).toBe(created.updatedAt);
    expectValidIsoInstant(created.createdAt);
    expect(store.get("page_alpha", "profile", "nickname")).toStrictEqual(
      created,
    );
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
      const store = createInMemoryMetadataStore({
        now: sequence("instant", [firstInstant]),
      });

      const created = store.set(
        metadataInput({
          pageId: "page_alpha",
          namespace: "profile",
          key: "nickname",
          value: "Fallback",
          valueType: "string",
          sourcePluginId: "profile-plugin",
        }),
      );

      expect(created.id).toBe("metadata_000102030405060708090a0b0c0d0e0f");
      expect(created.createdAt).toBe(firstInstant);
      expect(created.updatedAt).toBe(firstInstant);
      expectValidIsoInstant(created.createdAt);
      expect(store.get("page_alpha", "profile", "nickname")).toStrictEqual(
        created,
      );
      expect(store.list()).toStrictEqual([created]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("replaces an existing identity without changing id, createdAt, or list order", () => {
    const store = createStore({
      ids: ["metadata_alpha", "metadata_beta"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const alpha = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
        value: "light",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const beta = store.set(
      metadataInput({
        pageId: "page_beta",
        namespace: "profile",
        key: "theme",
        value: "light",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    const replacedAlpha = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
        value: {
          palette: "high-contrast",
          shortcuts: ["focus-mode", "sidebar"],
        },
        valueType: "json",
        sourcePluginId: "settings-plugin",
      }),
    );

    expect(replacedAlpha).toStrictEqual({
      id: alpha.id,
      pageId: alpha.pageId,
      namespace: alpha.namespace,
      key: alpha.key,
      value: {
        palette: "high-contrast",
        shortcuts: ["focus-mode", "sidebar"],
      },
      valueType: "json",
      sourcePluginId: "settings-plugin",
      createdAt: alpha.createdAt,
      updatedAt: thirdInstant,
    });
    expect(replacedAlpha.createdAt).toBe(firstInstant);
    expect(replacedAlpha.updatedAt).toBe(thirdInstant);
    expect(store.list()).toStrictEqual([replacedAlpha, beta]);
    expect(store.list()).toHaveLength(2);
  });

  it("leaves an existing record unchanged when replacements are rejected", () => {
    const store = createStore({
      ids: ["metadata_existing"],
      instants: [firstInstant],
    });
    const metadataIdentity = identity(
      "page_alpha",
      "profile",
      "refreshInterval",
    );
    const existing = store.set(
      metadataInput({
        ...metadataIdentity,
        value: 15,
        valueType: "number",
        sourcePluginId: "profile-plugin",
      }),
    );

    expectMetadataStoreError(
      () =>
        store.set(
          metadataInput({
            ...metadataIdentity,
            value: "15",
            valueType: "number",
            sourcePluginId: "settings-plugin",
          }),
        ),
      "METADATA_VALUE_TYPE_MISMATCH",
      metadataIdentity,
    );
    expect(
      store.get(
        metadataIdentity.pageId,
        metadataIdentity.namespace,
        metadataIdentity.key,
      ),
    ).toStrictEqual(existing);
    expect(store.list()).toStrictEqual([existing]);

    expectMetadataStoreError(
      () =>
        store.set(
          metadataInput({
            ...metadataIdentity,
            value: undefined as unknown as MetadataJsonValue,
            valueType: "json",
            sourcePluginId: "settings-plugin",
          }),
        ),
      "METADATA_VALUE_NOT_JSON_COMPATIBLE",
      metadataIdentity,
    );
    expect(
      store.get(
        metadataIdentity.pageId,
        metadataIdentity.namespace,
        metadataIdentity.key,
      ),
    ).toStrictEqual(existing);
    expect(store.list()).toStrictEqual([existing]);
  });

  it("keeps the same key distinct across page ids and namespaces", () => {
    const store = createStore({
      ids: [
        "metadata_alpha_profile",
        "metadata_beta_profile",
        "metadata_alpha_settings",
        "metadata_alpha_locale",
      ],
      instants: [firstInstant, secondInstant, thirdInstant, fourthInstant],
    });
    const alphaProfileTheme = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
        value: "light",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const betaProfileTheme = store.set(
      metadataInput({
        pageId: "page_beta",
        namespace: "profile",
        key: "theme",
        value: "dark",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const alphaSettingsTheme = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "settings",
        key: "theme",
        value: { mode: "contrast" },
        valueType: "json",
        sourcePluginId: "settings-plugin",
      }),
    );
    const alphaProfileLocale = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "locale",
        value: "en-US",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(store.get("page_alpha", "profile", "theme")).toStrictEqual(
      alphaProfileTheme,
    );
    expect(store.get("page_beta", "profile", "theme")).toStrictEqual(
      betaProfileTheme,
    );
    expect(store.get("page_alpha", "settings", "theme")).toStrictEqual(
      alphaSettingsTheme,
    );
    expect(store.get("page_alpha", "profile", "locale")).toStrictEqual(
      alphaProfileLocale,
    );
    expect(store.list({ pageId: "page_alpha" })).toStrictEqual([
      alphaProfileTheme,
      alphaSettingsTheme,
      alphaProfileLocale,
    ]);
    expect(store.list({ namespace: "profile" })).toStrictEqual([
      alphaProfileTheme,
      betaProfileTheme,
      alphaProfileLocale,
    ]);
    expect(store.list({ key: "theme" })).toStrictEqual([
      alphaProfileTheme,
      betaProfileTheme,
      alphaSettingsTheme,
    ]);
    expect(
      store.list({ pageId: "page_alpha", namespace: "profile" }),
    ).toStrictEqual([alphaProfileTheme, alphaProfileLocale]);
    expect(
      store.list({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
      }),
    ).toStrictEqual([alphaProfileTheme]);
    expect(store.list({ pageId: "page_missing" })).toStrictEqual([]);
  });

  it("keeps delimiter-style exact identities distinct", () => {
    const store = createStore({
      ids: ["metadata_page_delimiter", "metadata_namespace_delimiter"],
      instants: [firstInstant, secondInstant],
    });
    const pageDelimiter = store.set(
      metadataInput({
        pageId: "page:a",
        namespace: "b",
        key: "c",
        value: "page-delimited",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const namespaceDelimiter = store.set(
      metadataInput({
        pageId: "page",
        namespace: "a:b",
        key: "c",
        value: "namespace-delimited",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(store.get("page:a", "b", "c")).toStrictEqual(pageDelimiter);
    expect(store.get("page", "a:b", "c")).toStrictEqual(namespaceDelimiter);
    expect(store.list({ pageId: "page:a" })).toStrictEqual([pageDelimiter]);
    expect(store.list({ namespace: "a:b" })).toStrictEqual([
      namespaceDelimiter,
    ]);
    expect(store.list({ key: "c" })).toStrictEqual([
      pageDelimiter,
      namespaceDelimiter,
    ]);
  });

  it("deletes exact identities and creates a fresh record after delete", () => {
    const store = createStore({
      ids: ["metadata_alpha", "metadata_beta"],
      instants: [firstInstant, secondInstant],
    });
    const firstRecord = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "layout",
        value: { density: "comfortable" },
        valueType: "json",
        sourcePluginId: "profile-plugin",
      }),
    );

    const deleted = store.delete("page_alpha", "profile", "layout");

    expect(deleted).toStrictEqual(firstRecord);
    mutateObjectValue(deleted, "density", "changed-deleted-return");
    expect(store.list()).toStrictEqual([]);
    expectMetadataStoreError(
      () => store.delete("page_alpha", "profile", "layout"),
      "METADATA_NOT_FOUND",
      identity("page_alpha", "profile", "layout"),
    );

    const secondRecord = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "layout",
        value: { density: "compact" },
        valueType: "json",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(secondRecord.id).toBe("metadata_beta");
    expect(secondRecord.createdAt).toBe(secondInstant);
    expect(secondRecord.updatedAt).toBe(secondInstant);
    expect(secondRecord.id).not.toBe(firstRecord.id);
    expect(secondRecord.createdAt).not.toBe(firstRecord.createdAt);
    expect(secondRecord.value).toStrictEqual({ density: "compact" });
  });

  it("requires sourcePluginId without making it part of identity", () => {
    const store = createStore({
      ids: numberedValues("metadata_source", 4),
      instants: numberedInstants(4),
    });
    const metadataIdentity = identity("page_alpha", "profile", "visibility");

    expectMetadataStoreError(
      () =>
        store.set(
          metadataInput({
            ...metadataIdentity,
            value: true,
            valueType: "boolean",
            sourcePluginId: "",
          }),
        ),
      "METADATA_SOURCE_PLUGIN_REQUIRED",
      metadataIdentity,
    );
    expectMetadataStoreError(
      () =>
        store.set(
          metadataInput({
            ...metadataIdentity,
            value: true,
            valueType: "boolean",
            sourcePluginId: "   ",
          }),
        ),
      "METADATA_SOURCE_PLUGIN_REQUIRED",
      metadataIdentity,
    );

    const created = store.set(
      metadataInput({
        ...metadataIdentity,
        value: true,
        valueType: "boolean",
        sourcePluginId: " settings-plugin ",
      }),
    );
    const replaced = store.set(
      metadataInput({
        ...metadataIdentity,
        value: false,
        valueType: "boolean",
        sourcePluginId: "profile-plugin",
      }),
    );

    expect(created.namespace).toBe("profile");
    expect(created.sourcePluginId).toBe("settings-plugin");
    expect(replaced.id).toBe(created.id);
    expect(replaced.sourcePluginId).toBe("profile-plugin");
    expect(store.list()).toStrictEqual([replaced]);
  });

  it("uses defensive copies at input, set, get, list, delete, and replacement boundaries", () => {
    const store = createStore({
      ids: ["metadata_alpha", "metadata_beta"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const inputValue = {
      nested: {
        accents: ["blue"],
      },
    };
    const created = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "preferences",
        value: inputValue,
        valueType: "json",
        sourcePluginId: "profile-plugin",
      }),
    );

    inputValue.nested.accents[0] = "changed-input";
    expect(metadataValue(store.get("page_alpha", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["blue"] },
    });

    mutateNestedAccent(created, "changed-set-return");
    expect(metadataValue(store.get("page_alpha", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["blue"] },
    });

    const readRecord = store.get("page_alpha", "profile", "preferences");
    mutateNestedAccent(readRecord, "changed-get-return");
    expect(metadataValue(store.get("page_alpha", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["blue"] },
    });

    const listedRecords = store.list();
    mutateNestedAccent(listedRecords[0]!, "changed-list-return");
    listedRecords.push({
      id: "metadata_extra",
      pageId: "page_extra",
      namespace: "profile",
      key: "preferences",
      value: { nested: { accents: ["extra"] } },
      valueType: "json",
      sourcePluginId: "profile-plugin",
      createdAt: fourthInstant,
      updatedAt: fourthInstant,
    });
    expect(store.list()).toHaveLength(1);
    expect(metadataValue(store.get("page_alpha", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["blue"] },
    });

    const replacementValue = {
      nested: {
        accents: ["green"],
      },
    };
    const replaced = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "preferences",
        value: replacementValue,
        valueType: "json",
        sourcePluginId: "profile-plugin",
      }),
    );

    replacementValue.nested.accents[0] = "changed-replacement-input";
    mutateNestedAccent(replaced, "changed-replacement-return");
    expect(metadataValue(store.get("page_alpha", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["green"] },
    });

    store.set(
      metadataInput({
        pageId: "page_beta",
        namespace: "profile",
        key: "preferences",
        value: { nested: { accents: ["orange"] } },
        valueType: "json",
        sourcePluginId: "profile-plugin",
      }),
    );
    const deleted = store.delete("page_alpha", "profile", "preferences");
    mutateNestedAccent(deleted, "changed-delete-return");
    expect(metadataValue(store.get("page_beta", "profile", "preferences"))).toStrictEqual({
      nested: { accents: ["orange"] },
    });
  });

  it("accepts explicit value types for JSON-compatible values", () => {
    const store = createStore({
      ids: [
        "metadata_string",
        "metadata_number",
        "metadata_boolean",
        "metadata_null",
        "metadata_date",
        "metadata_json_object",
        "metadata_json_array",
      ],
      instants: [
        firstInstant,
        secondInstant,
        thirdInstant,
        fourthInstant,
        "2026-05-19T10:20:00.000Z",
        "2026-05-19T10:25:00.000Z",
        "2026-05-19T10:30:00.000Z",
      ],
    });
    const acceptedValues: Array<
      Pick<SetMetadataInput, "value" | "valueType"> & { key: string }
    > = [
      { key: "displayName", value: "Ada", valueType: "string" },
      { key: "refreshInterval", value: 15, valueType: "number" },
      { key: "sidebarVisible", value: true, valueType: "boolean" },
      { key: "selectedView", value: null, valueType: "null" },
      {
        key: "reviewedAt",
        value: "2026-05-19T09:00:00.000Z",
        valueType: "date",
      },
      {
        key: "layout",
        value: { density: "compact", columns: ["name", "state"] },
        valueType: "json",
      },
      {
        key: "favoriteColors",
        value: ["blue", "green", { custom: true }],
        valueType: "json",
      },
    ];

    for (const acceptedValue of acceptedValues) {
      const created = store.set(
        metadataInput({
          pageId: "page_alpha",
          namespace: "profile",
          sourcePluginId: "profile-plugin",
          ...acceptedValue,
        }),
      );

      expect(created.value).toStrictEqual(acceptedValue.value);
      expect(created.valueType).toBe(acceptedValue.valueType);
      expect(
        store.get("page_alpha", "profile", acceptedValue.key),
      ).toStrictEqual(created);
    }

    expect(store.list().map((record) => record.id)).toStrictEqual([
      "metadata_string",
      "metadata_number",
      "metadata_boolean",
      "metadata_null",
      "metadata_date",
      "metadata_json_object",
      "metadata_json_array",
    ]);
  });

  it("rejects valueType mismatches, including JSON primitives", () => {
    const store = createStore({
      ids: numberedValues("metadata_mismatch", 12),
      instants: numberedInstants(12),
    });
    const mismatchedValues: Array<{
      key: string;
      value: MetadataJsonValue;
      valueType: SetMetadataInput["valueType"];
    }> = [
      { key: "numberAsString", value: 42, valueType: "string" },
      { key: "stringAsNumber", value: "42", valueType: "number" },
      { key: "objectAsBoolean", value: { enabled: true }, valueType: "boolean" },
      { key: "arrayAsDate", value: ["2026-05-19"], valueType: "date" },
      { key: "stringAsJson", value: "compact", valueType: "json" },
      { key: "numberAsJson", value: 1, valueType: "json" },
      { key: "booleanAsJson", value: true, valueType: "json" },
      { key: "nullAsJson", value: null, valueType: "json" },
    ];

    for (const mismatchedValue of mismatchedValues) {
      const metadataIdentity = identity(
        "page_alpha",
        "profile",
        mismatchedValue.key,
      );

      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: mismatchedValue.value,
              valueType: mismatchedValue.valueType,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_VALUE_TYPE_MISMATCH",
        metadataIdentity,
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("rejects non-JSON-compatible values with typed errors", () => {
    const store = createStore({
      ids: numberedValues("metadata_invalid", 20),
      instants: numberedInstants(20),
    });
    const cyclicValue: Record<string, unknown> = { label: "cycle" };
    cyclicValue.self = cyclicValue;
    const sparseArray: unknown[] = [];
    sparseArray[1] = "missing-zero";

    class PreferenceInstance {
      readonly mode = "instance";
    }

    const invalidValues: Array<{
      key: string;
      value: unknown;
      valueType: SetMetadataInput["valueType"];
    }> = [
      { key: "undefined", value: undefined, valueType: "json" },
      { key: "function", value: () => "value", valueType: "json" },
      { key: "symbol", value: Symbol("metadata"), valueType: "json" },
      { key: "bigint", value: 1n, valueType: "number" },
      { key: "nan", value: Number.NaN, valueType: "number" },
      { key: "infinity", value: Number.POSITIVE_INFINITY, valueType: "number" },
      { key: "cycle", value: cyclicValue, valueType: "json" },
      { key: "date", value: new Date(firstInstant), valueType: "date" },
      { key: "map", value: new Map([["density", "compact"]]), valueType: "json" },
      { key: "set", value: new Set(["compact"]), valueType: "json" },
      {
        key: "classInstance",
        value: new PreferenceInstance(),
        valueType: "json",
      },
      { key: "sparseArray", value: sparseArray, valueType: "json" },
      {
        key: "arrayWithUndefined",
        value: ["compact", undefined],
        valueType: "json",
      },
    ];

    for (const invalidValue of invalidValues) {
      const metadataIdentity = identity(
        "page_alpha",
        "profile",
        invalidValue.key,
      );

      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: invalidValue.value as unknown as MetadataJsonValue,
              valueType: invalidValue.valueType,
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_VALUE_NOT_JSON_COMPATIBLE",
        metadataIdentity,
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("rejects arrays with own non-index and symbol properties", () => {
    const store = createStore({
      ids: numberedValues("metadata_array_extra", 2),
      instants: numberedInstants(2),
    });
    const arrayWithStringProperty = ["compact"] as unknown[] & {
      metadataState?: string;
    };
    arrayWithStringProperty.metadataState = "hidden";
    const metadataSymbol = Symbol("metadata");
    const arrayWithSymbolProperty = ["compact"] as unknown[];
    (arrayWithSymbolProperty as unknown as Record<symbol, unknown>)[
      metadataSymbol
    ] = "hidden";
    const invalidValues: Array<{
      key: string;
      value: unknown[];
    }> = [
      { key: "arrayWithStringProperty", value: arrayWithStringProperty },
      { key: "arrayWithSymbolProperty", value: arrayWithSymbolProperty },
    ];

    for (const invalidValue of invalidValues) {
      const metadataIdentity = identity(
        "page_alpha",
        "profile",
        invalidValue.key,
      );

      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: invalidValue.value as unknown as MetadataJsonValue,
              valueType: "json",
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_VALUE_NOT_JSON_COMPATIBLE",
        metadataIdentity,
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("rejects sparse arrays when missing indexes exist on the array prototype", () => {
    const store = createStore({
      ids: ["metadata_inherited_sparse_array"],
      instants: [firstInstant],
    });
    const prototypeWithInheritedIndex = Object.create(Array.prototype, {
      0: {
        configurable: true,
        enumerable: true,
        value: "inherited-zero",
      },
    });
    const inheritedSparseArray: unknown[] = [];
    const originalPrototype = Object.getPrototypeOf(inheritedSparseArray);
    inheritedSparseArray[1] = "own-one";
    Object.setPrototypeOf(inheritedSparseArray, prototypeWithInheritedIndex);

    try {
      expect(0 in inheritedSparseArray).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(inheritedSparseArray, 0),
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(inheritedSparseArray, 1),
      ).toBe(true);

      const metadataIdentity = identity(
        "page_alpha",
        "profile",
        "inheritedSparseArray",
      );

      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: inheritedSparseArray as unknown as MetadataJsonValue,
              valueType: "json",
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_VALUE_NOT_JSON_COMPATIBLE",
        metadataIdentity,
      );
      expect(store.list()).toStrictEqual([]);
    } finally {
      Object.setPrototypeOf(inheritedSparseArray, originalPrototype);
    }
  });

  it("rejects empty identity parts", () => {
    const store = createStore({
      ids: numberedValues("metadata_identity", 8),
      instants: numberedInstants(8),
    });
    const invalidIdentities: MetadataIdentity[] = [
      identity("", "profile", "theme"),
      identity("   ", "profile", "theme"),
      identity("page_alpha", "", "theme"),
      identity("page_alpha", "   ", "theme"),
      identity("page_alpha", "profile", ""),
      identity("page_alpha", "profile", "   "),
    ];

    for (const metadataIdentity of invalidIdentities) {
      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: "light",
              valueType: "string",
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_IDENTITY_REQUIRED",
        metadataIdentity,
      );
    }

    expect(store.list()).toStrictEqual([]);
  });

  it("throws not-found errors with identity context for missing get and delete", () => {
    const store = createStore({
      ids: ["metadata_alpha"],
      instants: [firstInstant],
    });
    const existing = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
        value: "light",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const missingIdentity = identity("page_missing", "profile", "theme");

    expectMetadataStoreError(
      () => store.get("page_missing", "profile", "theme"),
      "METADATA_NOT_FOUND",
      missingIdentity,
    );
    expectMetadataStoreError(
      () => store.delete("page_missing", "profile", "theme"),
      "METADATA_NOT_FOUND",
      missingIdentity,
    );
    expect(store.get("page_alpha", "profile", "theme")).toStrictEqual(
      existing,
    );
    expect(store.list()).toStrictEqual([existing]);
  });

  it("throws a typed collision error for new identities without overwriting records", () => {
    const store = createStore({
      ids: ["metadata_alpha", "metadata_alpha"],
      instants: [firstInstant, secondInstant],
    });
    const existing = store.set(
      metadataInput({
        pageId: "page_alpha",
        namespace: "profile",
        key: "theme",
        value: "light",
        valueType: "string",
        sourcePluginId: "profile-plugin",
      }),
    );
    const collidingIdentity = identity("page_beta", "profile", "theme");

    expectMetadataStoreError(
      () =>
        store.set(
          metadataInput({
            ...collidingIdentity,
            value: "dark",
            valueType: "string",
            sourcePluginId: "profile-plugin",
          }),
        ),
      "METADATA_ID_COLLISION",
      collidingIdentity,
    );
    expect(store.get("page_alpha", "profile", "theme")).toStrictEqual(
      existing,
    );
    expect(store.list()).toStrictEqual([existing]);
  });

  it("surfaces clone failures as typed errors without storing the record", () => {
    vi.stubGlobal("structuredClone", () => {
      throw new DOMException("Cannot clone", "DataCloneError");
    });

    try {
      const store = createStore({
        ids: ["metadata_alpha"],
        instants: [firstInstant],
      });
      const metadataIdentity = identity("page_alpha", "profile", "layout");

      expectMetadataStoreError(
        () =>
          store.set(
            metadataInput({
              ...metadataIdentity,
              value: { density: "compact" },
              valueType: "json",
              sourcePluginId: "profile-plugin",
            }),
          ),
        "METADATA_CLONE_FAILED",
        metadataIdentity,
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
}): MetadataStore {
  return createInMemoryMetadataStore({
    createId: sequence("id", ids),
    now: sequence("instant", instants),
  });
}

function metadataInput(input: SetMetadataInput): SetMetadataInput {
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

function identity(
  pageId: string,
  namespace: string,
  key: string,
): MetadataIdentity {
  return { pageId, namespace, key };
}

function expectValidIsoInstant(value: string): void {
  const parsedInstant = Date.parse(value);

  expect(Number.isNaN(parsedInstant)).toBe(false);
  expect(new Date(parsedInstant).toISOString()).toBe(value);
}

function metadataValue(record: MetadataRecord): unknown {
  return record.value;
}

function mutateObjectValue(
  record: MetadataRecord,
  key: string,
  value: string,
): void {
  const objectValue = record.value as Record<string, unknown>;
  objectValue[key] = value;
}

function mutateNestedAccent(record: MetadataRecord, value: string): void {
  const objectValue = record.value as {
    nested: {
      accents: string[];
    };
  };

  objectValue.nested.accents[0] = value;
}

function expectMetadataStoreError(
  action: () => unknown,
  code: string,
  metadataIdentity: MetadataIdentity,
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(MetadataStoreError);

    if (error instanceof MetadataStoreError) {
      expect(error.code).toBe(code);
      expect(error.pageId).toBe(metadataIdentity.pageId);
      expect(error.namespace).toBe(metadataIdentity.namespace);
      expect(error.key).toBe(metadataIdentity.key);
    }

    return;
  }

  throw new Error("Expected MetadataStoreError");
}
