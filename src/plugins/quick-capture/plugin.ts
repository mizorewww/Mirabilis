import { createElement, type ReactElement } from "react";

import {
  importMarkdownToStructuredDocument,
  type AppPlugin,
  type BlockNode,
  type MarkdownPage,
  type PluginContext,
  type PluginFilterQuery,
  type PluginSaveFilterInput,
  type PluginTransaction,
  type StructuredMarkdownDocument,
} from "../../core";

type QuickCaptureSavePayload = {
  markdown: string;
};

type QuickCaptureSaveResult = {
  appendedBlockIds: string[];
  createdInbox: boolean;
  kind: "quick-capture.save-result";
  pageId: string;
};

type QuickCaptureSaveAndOpenResult = QuickCaptureSaveResult & {
  openPageId: string;
};

type QuickCaptureOpenResult = {
  kind: "quick-capture.open-result";
  viewId: "quick-capture.modal";
};

const pluginId = "quick-capture";
const inboxTitle = "Inbox";
const namespace = "quick-capture";
const unprocessedMetadataKey = "unprocessed";
const unprocessedMetadataFieldId = "quick-capture.unprocessed";
const openCommandId = "quick-capture.open";
const saveCommandId = "quick-capture.save";
const saveAndOpenCommandId = "quick-capture.save-and-open";
const modalViewId = "quick-capture.modal";
const mobileInputViewId = "quick-capture.mobile-input";
const inboxFilterId = "quick-capture.filter.inbox";
const pageListViewType = "page.list";
const maxCaptureMarkdownLength = 50_000;
const savePayloadKeys = new Set(["markdown"]);
const emptyPayloadKeys = new Set<string>();
const inboxFilterQuery = {
  where: [
    {
      field: "metadata.quick-capture.unprocessed",
      op: "eq",
      value: true,
    },
  ],
} satisfies PluginFilterQuery;

type QuickCaptureDefaultFilterInput = PluginSaveFilterInput & {
  id: string;
};

export const QuickCapturePlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "Quick Capture Plugin",
    version: "1.0.0",
    description: "Capture Markdown into a plugin-owned Inbox page.",
    minAppVersion: "0.1.0",
    contributes: {
      metadataFields: [
        {
          id: unprocessedMetadataFieldId,
          namespace,
          key: unprocessedMetadataKey,
          valueType: "boolean",
        },
      ],
    },
  },
  register(ctx) {
    upsertInboxFilter(ctx);

    ctx.commands.register<unknown, QuickCaptureOpenResult>({
      id: openCommandId,
      title: "Open Quick Capture",
      handler: openQuickCapture,
    });

    ctx.commands.register<unknown, QuickCaptureSaveResult>({
      id: saveCommandId,
      title: "Save Quick Capture",
      handler: saveQuickCapture,
    });

    ctx.commands.register<unknown, QuickCaptureSaveAndOpenResult>({
      id: saveAndOpenCommandId,
      title: "Save Quick Capture and open Inbox",
      handler: saveQuickCaptureAndOpen,
    });

    ctx.views.register({
      accepts: {
        kind: modalViewId,
      },
      component: QuickCaptureModalView,
      id: modalViewId,
      title: "Quick Capture",
      type: modalViewId,
    });

    ctx.views.register({
      accepts: {
        kind: mobileInputViewId,
      },
      component: QuickCaptureMobileInputView,
      id: mobileInputViewId,
      title: "Quick Capture mobile input",
      type: mobileInputViewId,
    });
  },
};

function upsertInboxFilter(ctx: PluginContext): void {
  const filter: QuickCaptureDefaultFilterInput = {
    id: inboxFilterId,
    name: "Inbox",
    query: inboxFilterQuery,
    viewType: pageListViewType,
  };

  try {
    ctx.filters.get(filter.id);
  } catch {
    ctx.filters.save(filter);
    return;
  }

  ctx.filters.update(filter.id, {
    group: null,
    name: filter.name,
    query: filter.query,
    sort: null,
    viewType: filter.viewType,
  });
}

function openQuickCapture(input: unknown): QuickCaptureOpenResult {
  readExactRecord(
    input === undefined ? {} : input,
    emptyPayloadKeys,
    `${openCommandId} input`,
  );

  return {
    kind: "quick-capture.open-result",
    viewId: modalViewId,
  };
}

function saveQuickCapture(
  input: unknown,
  ctx: PluginContext,
): Promise<QuickCaptureSaveResult> {
  return saveCapture(readSavePayload(input), ctx);
}

async function saveQuickCaptureAndOpen(
  input: unknown,
  ctx: PluginContext,
): Promise<QuickCaptureSaveAndOpenResult> {
  const result = await saveCapture(readSavePayload(input), ctx);

  return {
    ...result,
    openPageId: result.pageId,
  };
}

function saveCapture(
  payload: QuickCaptureSavePayload,
  ctx: PluginContext,
): Promise<QuickCaptureSaveResult> {
  const captureDocument = importMarkdownToStructuredDocument(payload.markdown, {
    maxInputLength: maxCaptureMarkdownLength,
  });
  const appendedBlockIds = captureDocument.content.map((block) => block.blockId);

  return ctx.transaction.run((tx) => {
    const existingInbox = findTrustedInbox(tx);

    if (existingInbox === undefined) {
      const page = tx.pages.create({
        body: captureDocument,
        title: inboxTitle,
      });

      writeInboxMetadata(tx, page.id);

      return {
        appendedBlockIds,
        createdInbox: true,
        kind: "quick-capture.save-result",
        pageId: page.id,
      };
    }

    tx.pages.update(existingInbox.id, {
      body: appendDocument(existingInbox.body, captureDocument),
    });

    return {
      appendedBlockIds,
      createdInbox: false,
      kind: "quick-capture.save-result",
      pageId: existingInbox.id,
    };
  });
}

function findTrustedInbox(tx: PluginTransaction): MarkdownPage | undefined {
  const trustedInboxIds = tx.metadata
    .list({
      key: unprocessedMetadataKey,
      namespace,
    })
    .filter((record) => record.value === true)
    .map((record) => record.pageId);

  for (const pageId of trustedInboxIds) {
    try {
      const page = tx.pages.get(pageId);

      if (page.title === inboxTitle && page.archivedAt === undefined) {
        return page;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function writeInboxMetadata(tx: PluginTransaction, pageId: string): void {
  tx.metadata.set({
    key: unprocessedMetadataKey,
    namespace,
    pageId,
    value: true,
    valueType: "boolean",
  });
}

function appendDocument(
  existingDocument: StructuredMarkdownDocument,
  captureDocument: StructuredMarkdownDocument,
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      ...existingDocument.content.map(copyBlock),
      ...captureDocument.content.map(copyBlock),
    ],
  };
}

function copyBlock(block: BlockNode): BlockNode {
  return {
    ...block,
    ...(block.attrs === undefined ? {} : { attrs: { ...block.attrs } }),
    ...(block.content === undefined
      ? {}
      : { content: block.content.map(copyBlock) }),
    ...(block.marks === undefined ? {} : { marks: [...block.marks] }),
  };
}

function readSavePayload(input: unknown): QuickCaptureSavePayload {
  const payload = readExactRecord(
    input,
    savePayloadKeys,
    `${saveCommandId} input`,
  );
  const markdown = payload.markdown;

  if (
    typeof markdown !== "string" ||
    markdown.trim().length === 0 ||
    markdown.length > maxCaptureMarkdownLength
  ) {
    throw new Error(`${saveCommandId} requires bounded nonblank markdown`);
  }

  return { markdown };
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} must be exact plain data`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (ownKeys.length !== requiredKeys.size) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of ownKeys) {
    if (typeof key !== "string" || !requiredKeys.has(key)) {
      throw new Error(`${label} contains untrusted fields`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} must be exact plain data`);
    }
  }

  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  return input as Record<string, unknown>;
}

function QuickCaptureModalView(): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "Quick Capture",
      role: "dialog",
    },
    createElement("textarea", {
      "aria-label": "Quick Capture Markdown",
      name: "quick-capture-markdown",
    }),
  );
}

function QuickCaptureMobileInputView(): ReactElement {
  return createElement(
    "section",
    {
      "aria-label": "Quick Capture mobile input",
      role: "region",
    },
    createElement("textarea", {
      "aria-label": "Quick Capture Markdown",
      name: "quick-capture-mobile-markdown",
    }),
  );
}
