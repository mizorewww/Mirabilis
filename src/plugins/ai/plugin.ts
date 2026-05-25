import type { AppPlugin } from "../../core";

import {
  type AiReviewPanelProps,
  AiReviewPanel,
} from "./views/AiReviewPanel";
import {
  type AiSuggestionPanelProps,
  AiSuggestionPanel,
} from "./views/AiSuggestionPanel";
import {
  defaultOpenAiModel,
  getAiProviderSettings,
} from "./settings";
import { createOpenAIProvider } from "./providers/openAIProvider";
import type {
  AiCommandResult,
  AiModelProvider,
  AiOperation,
  AiProviderBoundaryRequest,
} from "./providers/modelProvider";

type AiCommandId =
  | "ai.cleanup-inbox"
  | "ai.turn-text-into-task"
  | "ai.suggest-tags"
  | "ai.suggest-due-date"
  | "ai.generate-subtasks"
  | "ai.generate-filter"
  | "ai.summarize-time-notes"
  | "ai.generate-weekly-review"
  | "ai.explain-prediction";

type AiCommandSpec = {
  commandId: AiCommandId;
  description: string;
  expectedKind: string;
  inputKind: string;
  operation: AiOperation;
  outputKeys: ReadonlySet<string>;
  schemaName: string;
  title: string;
};

type AiFailureKind =
  | "ai.command-rejected"
  | "ai.provider-output-invalid"
  | "ai.provider-unavailable"
  | "ai.provider-unconfigured";

type FieldDescriptor = {
  field: string;
  valueType: string;
};

const pluginId = "ai";
const suggestionPanelViewId = "ai.suggestion-panel";
const reviewPanelViewId = "ai.review-panel";
const providerSettingsPanelId = "ai.provider-settings";
const providerId = "openai";
const maxAiTextLength = 50_000;
const maxAiProjectionItems = 100;
const maxJsonDepth = 8;
const maxJsonNodes = 1_000;
const allowedFilterOperators = new Set([
  "eq",
  "exists",
  "gt",
  "includes",
  "lt",
  "within",
]);
const allowedMetadataValueTypes = new Set([
  "boolean",
  "date",
  "json",
  "null",
  "number",
  "string",
]);
const forbiddenTopLevelFields = new Set([
  "apiKey",
  "authorization",
  "model",
  "provider",
  "secret",
  "token",
]);
const pageProjectionKeys = new Set(["bodyMarkdown", "id", "title"]);
const metadataProjectionKeys = new Set([
  "key",
  "namespace",
  "pageId",
  "sourcePluginId",
  "value",
  "valueType",
]);
const eventProjectionKeys = new Set([
  "createdAt",
  "namespace",
  "payload",
  "sourcePluginId",
  "type",
]);
const eventProjectionOptionalKeys = new Set(["pageId"]);
const captureProjectionKeys = new Set(["id", "text"]);
const allowedFieldKeys = new Set(["field", "valueType"]);
const filterSuggestionKeys = new Set(["filter", "kind", "reason"]);
const filterKeys = new Set(["name", "query", "viewType"]);
const filterQueryKeys = new Set(["where"]);
const filterConditionKeys = new Set(["field", "op", "value"]);
const filterConditionOptionalKeys = new Set(["value"]);
const commandSpecs = [
  {
    commandId: "ai.cleanup-inbox",
    description: "Suggest a cleaned Markdown capture from caller-provided text.",
    expectedKind: "ai.cleanup-inbox-suggestion",
    inputKind: "ai.cleanup-inbox-input",
    operation: "cleanup-inbox",
    outputKeys: new Set([
      "cleanedMarkdown",
      "kind",
      "suggestedMetadata",
      "warnings",
    ]),
    schemaName: "ai_cleanup_inbox_response",
    title: "Clean up inbox capture",
  },
  {
    commandId: "ai.turn-text-into-task",
    description: "Suggest a task DTO from bounded caller-provided text.",
    expectedKind: "ai.task-suggestion",
    inputKind: "ai.turn-text-into-task-input",
    operation: "turn-text-into-task",
    outputKeys: new Set(["kind", "markdown", "metadata", "tags", "title"]),
    schemaName: "ai_turn_text_into_task_response",
    title: "Turn text into task",
  },
  {
    commandId: "ai.suggest-tags",
    description: "Suggest tags from caller-provided page and tag projections.",
    expectedKind: "ai.suggested-tags",
    inputKind: "ai.suggest-tags-input",
    operation: "suggest-tags",
    outputKeys: new Set(["confidence", "kind", "tags"]),
    schemaName: "ai_suggest_tags_response",
    title: "Suggest tags",
  },
  {
    commandId: "ai.suggest-due-date",
    description: "Suggest a due date from caller-provided page metadata.",
    expectedKind: "ai.suggested-due-date",
    inputKind: "ai.suggest-due-date-input",
    operation: "suggest-due-date",
    outputKeys: new Set(["confidence", "dueDate", "kind", "reason"]),
    schemaName: "ai_suggest_due_date_response",
    title: "Suggest due date",
  },
  {
    commandId: "ai.generate-subtasks",
    description: "Suggest Markdown subtasks without mutating task data.",
    expectedKind: "ai.subtask-suggestions",
    inputKind: "ai.generate-subtasks-input",
    operation: "generate-subtasks",
    outputKeys: new Set(["kind", "markdown", "subtasks"]),
    schemaName: "ai_generate_subtasks_response",
    title: "Generate subtasks",
  },
  {
    commandId: "ai.generate-filter",
    description: "Suggest a page list filter from allowed caller fields.",
    expectedKind: "ai.filter-suggestion",
    inputKind: "ai.generate-filter-input",
    operation: "generate-filter",
    outputKeys: filterSuggestionKeys,
    schemaName: "ai_generate_filter_response",
    title: "Generate filter",
  },
  {
    commandId: "ai.summarize-time-notes",
    description: "Summarize caller-provided time note projections.",
    expectedKind: "ai.time-notes-summary",
    inputKind: "ai.summarize-time-notes-input",
    operation: "summarize-time-notes",
    outputKeys: new Set(["highlights", "kind", "summary"]),
    schemaName: "ai_summarize_time_notes_response",
    title: "Summarize time notes",
  },
  {
    commandId: "ai.generate-weekly-review",
    description: "Generate an advisory weekly review from bounded projections.",
    expectedKind: "ai.weekly-review",
    inputKind: "ai.generate-weekly-review-input",
    operation: "generate-weekly-review",
    outputKeys: new Set(["kind", "nextActions", "risks", "summary", "wins"]),
    schemaName: "ai_generate_weekly_review_response",
    title: "Generate weekly review",
  },
  {
    commandId: "ai.explain-prediction",
    description: "Explain a caller-provided prediction DTO.",
    expectedKind: "ai.prediction-explanation",
    inputKind: "ai.explain-prediction-input",
    operation: "explain-prediction",
    outputKeys: new Set(["explanation", "kind", "limitations"]),
    schemaName: "ai_explain_prediction_response",
    title: "Explain prediction",
  },
] as const satisfies readonly AiCommandSpec[];

let configuredProvider: AiModelProvider = createOpenAIProvider();

export const AiPlugin: AppPlugin = {
  manifest: {
    id: pluginId,
    name: "AI Plugin",
    version: "1.0.0",
    description: "Generate advisory suggestions through a plugin-owned provider boundary.",
    minAppVersion: "0.1.0",
    contributes: {
      commands: commandSpecs.map((spec) => ({
        description: spec.description,
        id: spec.commandId,
        title: spec.title,
      })),
      eventTypes: [
        {
          id: "ai.suggestion-generated",
          namespace: pluginId,
          type: "suggestion-generated",
        },
        {
          id: "ai.summary-generated",
          namespace: pluginId,
          type: "summary-generated",
        },
      ],
      metadataFields: [
        {
          id: "ai.summary",
          key: "summary",
          namespace: pluginId,
          valueType: "string",
        },
        {
          id: "ai.suggestedTags",
          key: "suggestedTags",
          namespace: pluginId,
          valueType: "json",
        },
        {
          id: "ai.suggestedEstimate",
          key: "suggestedEstimate",
          namespace: pluginId,
          valueType: "number",
        },
      ],
      settingsPanels: [
        {
          id: providerSettingsPanelId,
          title: "Provider settings",
        },
      ],
      views: [
        {
          accepts: {
            kind: suggestionPanelViewId,
          },
          id: suggestionPanelViewId,
          title: "AI suggestion panel",
          type: suggestionPanelViewId,
        },
        {
          accepts: {
            kind: reviewPanelViewId,
          },
          id: reviewPanelViewId,
          title: "AI review panel",
          type: reviewPanelViewId,
        },
      ],
    },
  },
  register(ctx) {
    for (const spec of commandSpecs) {
      ctx.commands.register<unknown, AiCommandResult>({
        context: {
          providerId,
        },
        description: spec.description,
        id: spec.commandId,
        title: spec.title,
        handler: (input) => runAiCommand(spec, input),
      });
    }

    ctx.views.register<AiSuggestionPanelProps>({
      accepts: {
        kind: suggestionPanelViewId,
      },
      component: AiSuggestionPanel,
      id: suggestionPanelViewId,
      title: "AI suggestion panel",
      type: suggestionPanelViewId,
    });

    ctx.views.register<AiReviewPanelProps>({
      accepts: {
        kind: reviewPanelViewId,
      },
      component: AiReviewPanel,
      id: reviewPanelViewId,
      title: "AI review panel",
      type: reviewPanelViewId,
    });
  },
};

export function setAiProviderForTests(provider: AiModelProvider): () => void {
  const previous = configuredProvider;

  configuredProvider = provider;

  return () => {
    configuredProvider = previous;
  };
}

export function resetAiProviderForTests(): () => void {
  const previous = configuredProvider;

  configuredProvider = createOpenAIProvider();

  return () => {
    configuredProvider = previous;
  };
}

async function runAiCommand(
  spec: AiCommandSpec,
  input: unknown,
): Promise<AiCommandResult> {
  const payload = readCommandInput(spec, input);
  const settings = getAiProviderSettings();

  if (
    settings === null ||
    settings.providerId !== providerId ||
    settings.apiKey.trim().length === 0
  ) {
    return aiFailure("ai.provider-unconfigured");
  }

  const request: AiProviderBoundaryRequest = {
    operation: spec.operation,
    providerId,
    request: {
      input: {
        input: payload,
        operation: spec.operation,
      },
      instructions:
        "Return only advisory suggestion or review data for the caller-provided input.",
      model: readProviderModel(settings.model),
      store: false,
      text: {
        format: {
          name: spec.schemaName,
          schema: createResponseSchema(spec),
          strict: true,
          type: "json_schema",
        },
      },
    },
  };

  let output: unknown;

  try {
    output = await configuredProvider.generate(request);
  } catch {
    return aiFailure("ai.provider-unavailable");
  }

  try {
    return validateProviderOutput(spec, payload, output);
  } catch {
    return aiFailure("ai.provider-output-invalid");
  }
}

function readProviderModel(model: string): string {
  if (typeof model !== "string" || model.trim().length === 0) {
    return defaultOpenAiModel;
  }

  return model;
}

function readCommandInput(
  spec: AiCommandSpec,
  input: unknown,
): Record<string, unknown> {
  switch (spec.operation) {
    case "cleanup-inbox": {
      const payload = readExactRecord(
        input,
        new Set(["capture", "kind", "now"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readCaptureProjection(payload.capture);
      readBoundedText(payload.now, "now");
      return payload;
    }
    case "turn-text-into-task": {
      const payload = readExactRecord(
        input,
        new Set(["kind", "now", "text"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readBoundedText(payload.text, "text");
      readBoundedText(payload.now, "now");
      return payload;
    }
    case "suggest-tags": {
      const payload = readExactRecord(
        input,
        new Set(["existingTags", "kind", "page"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readPageProjection(payload.page);
      readStringArray(payload.existingTags, "existingTags");
      return payload;
    }
    case "suggest-due-date": {
      const payload = readExactRecord(
        input,
        new Set(["kind", "metadata", "now", "page"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readPageProjection(payload.page);
      readProjectionArray(payload.metadata, "metadata", readMetadataProjection);
      readBoundedText(payload.now, "now");
      return payload;
    }
    case "generate-subtasks": {
      const payload = readExactRecord(
        input,
        new Set(["existingChildren", "kind", "page"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readPageProjection(payload.page);
      readProjectionArray(
        payload.existingChildren,
        "existingChildren",
        readPageProjection,
      );
      return payload;
    }
    case "generate-filter": {
      const payload = readExactRecord(
        input,
        new Set(["allowedFields", "allowedOperators", "kind", "queryText"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readAllowedFields(payload.allowedFields);
      readAllowedOperators(payload.allowedOperators);
      readBoundedText(payload.queryText, "queryText");
      return payload;
    }
    case "summarize-time-notes": {
      const payload = readExactRecord(
        input,
        new Set(["events", "kind", "page"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readProjectionArray(payload.events, "events", readEventProjection);
      readPageProjection(payload.page);
      return payload;
    }
    case "generate-weekly-review": {
      const payload = readExactRecord(
        input,
        new Set(["events", "kind", "metadata", "pages", "weekEnd", "weekStart"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readProjectionArray(payload.events, "events", readEventProjection);
      readProjectionArray(payload.metadata, "metadata", readMetadataProjection);
      readProjectionArray(payload.pages, "pages", readPageProjection);
      readDateOnly(payload.weekStart, "weekStart");
      readDateOnly(payload.weekEnd, "weekEnd");
      return payload;
    }
    case "explain-prediction": {
      const payload = readExactRecord(
        input,
        new Set(["kind", "page", "prediction"]),
        spec.commandId,
      );

      requireKind(payload.kind, spec.inputKind, spec.commandId);
      readPageProjection(payload.page);
      readJsonProjection(payload.prediction, "prediction");
      return payload;
    }
  }
}

function validateProviderOutput(
  spec: AiCommandSpec,
  input: Record<string, unknown>,
  output: unknown,
): AiCommandResult {
  const payload = readExactRecord(output, spec.outputKeys, `${spec.commandId} output`);

  requireKind(payload.kind, spec.expectedKind, `${spec.commandId} output`);

  switch (spec.operation) {
    case "cleanup-inbox":
      readBoundedSafeText(payload.cleanedMarkdown, "cleanedMarkdown");
      readJsonProjection(payload.suggestedMetadata, "suggestedMetadata");
      readStringArray(payload.warnings, "warnings");
      break;
    case "turn-text-into-task":
      readBoundedSafeText(payload.markdown, "markdown");
      readJsonProjection(payload.metadata, "metadata");
      readStringArray(payload.tags, "tags");
      readBoundedSafeText(payload.title, "title");
      break;
    case "suggest-tags":
      readConfidence(payload.confidence, "confidence");
      readStringArray(payload.tags, "tags");
      break;
    case "suggest-due-date":
      readConfidence(payload.confidence, "confidence");
      readDateOnly(payload.dueDate, "dueDate");
      readBoundedSafeText(payload.reason, "reason");
      break;
    case "generate-subtasks":
      readBoundedSafeText(payload.markdown, "markdown");
      readStringArray(payload.subtasks, "subtasks");
      break;
    case "generate-filter":
      validateGeneratedFilter(input, payload);
      break;
    case "summarize-time-notes":
      readStringArray(payload.highlights, "highlights");
      readBoundedSafeText(payload.summary, "summary");
      break;
    case "generate-weekly-review":
      readStringArray(payload.nextActions, "nextActions");
      readStringArray(payload.risks, "risks");
      readBoundedSafeText(payload.summary, "summary");
      readStringArray(payload.wins, "wins");
      break;
    case "explain-prediction":
      readBoundedSafeText(payload.explanation, "explanation");
      readStringArray(payload.limitations, "limitations");
      break;
  }

  return sanitizePublicResult(payload);
}

function validateGeneratedFilter(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  const filter = readExactRecord(output.filter, filterKeys, "filter");
  const query = readExactRecord(filter.query, filterQueryKeys, "filter query");
  const allowedFields = new Set(
    readAllowedFields(input.allowedFields).map((field) => field.field),
  );
  const allowedOperatorsFromInput = new Set(
    readAllowedOperators(input.allowedOperators),
  );

  if (
    filter.viewType !== "page.list" ||
    typeof filter.name !== "string" ||
    filter.name.trim().length === 0 ||
    !isSafeText(filter.name)
  ) {
    throwProviderOutputError();
  }

  const conditions = readProjectionArray(
    query.where,
    "filter query conditions",
    (condition) => readExactRecord(
      condition,
      filterConditionKeys,
      "filter condition",
      filterConditionOptionalKeys,
    ),
  );

  for (const condition of conditions) {
    if (
      typeof condition.field !== "string" ||
      typeof condition.op !== "string" ||
      !allowedFields.has(condition.field) ||
      !allowedOperatorsFromInput.has(condition.op) ||
      !allowedFilterOperators.has(condition.op) ||
      !isSafeJsonValue(condition.value)
    ) {
      throwProviderOutputError();
    }
  }

  readBoundedSafeText(output.reason, "reason");
}

function readAllowedFields(input: unknown): FieldDescriptor[] {
  return readProjectionArray(input, "allowedFields", (entry) => {
    const payload = readExactRecord(entry, allowedFieldKeys, "allowed field");

    if (
      typeof payload.field !== "string" ||
      payload.field.trim().length === 0 ||
      typeof payload.valueType !== "string" ||
      !allowedMetadataValueTypes.has(payload.valueType)
    ) {
      throw new Error("AI command rejected");
    }

    return {
      field: payload.field,
      valueType: payload.valueType,
    };
  });
}

function readAllowedOperators(input: unknown): string[] {
  const values = readStringArray(input, "allowedOperators");

  for (const value of values) {
    if (!allowedFilterOperators.has(value)) {
      throw new Error("AI command rejected");
    }
  }

  return values;
}

function readCaptureProjection(input: unknown): Record<string, unknown> {
  const payload = readExactRecord(input, captureProjectionKeys, "capture");

  readNonBlankId(payload.id, "capture id");
  readBoundedText(payload.text, "capture text");
  return payload;
}

function readPageProjection(input: unknown): Record<string, unknown> {
  const payload = readExactRecord(input, pageProjectionKeys, "page");

  readNonBlankId(payload.id, "page id");
  readBoundedText(payload.title, "page title");
  readBoundedText(payload.bodyMarkdown, "page body");
  return payload;
}

function readMetadataProjection(input: unknown): Record<string, unknown> {
  const payload = readExactRecord(input, metadataProjectionKeys, "metadata");

  readNonBlankId(payload.pageId, "metadata page id");
  readBoundedText(payload.namespace, "metadata namespace");
  readBoundedText(payload.key, "metadata key");
  readBoundedText(payload.sourcePluginId, "metadata owner");

  if (
    typeof payload.valueType !== "string" ||
    !allowedMetadataValueTypes.has(payload.valueType) ||
    !isSafeJsonValue(payload.value)
  ) {
    throw new Error("AI command rejected");
  }

  return payload;
}

function readEventProjection(input: unknown): Record<string, unknown> {
  const payload = readExactRecord(
    input,
    eventProjectionKeys,
    "event",
    eventProjectionOptionalKeys,
  );

  readBoundedText(payload.createdAt, "event createdAt");
  readBoundedText(payload.namespace, "event namespace");
  readBoundedText(payload.sourcePluginId, "event owner");
  readBoundedText(payload.type, "event type");
  readJsonProjection(payload.payload, "event payload");

  if (payload.pageId !== undefined) {
    readNonBlankId(payload.pageId, "event page id");
  }

  return payload;
}

function readJsonProjection(input: unknown, label: string): unknown {
  const budget = { nodes: 0 };

  readJsonValue(input, label, 0, budget);
  return input;
}

function readJsonValue(
  input: unknown,
  label: string,
  depth: number,
  budget: {
    nodes: number;
  },
): void {
  budget.nodes += 1;

  if (budget.nodes > maxJsonNodes || depth > maxJsonDepth) {
    throw new Error("AI command rejected");
  }

  if (
    input === null ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return;
  }

  if (typeof input === "string") {
    readBoundedText(input, label);
    return;
  }

  if (Array.isArray(input)) {
    for (const value of copyPlainArray(input, label, maxAiProjectionItems)) {
      readJsonValue(value, label, depth + 1, budget);
    }
    return;
  }

  const payload = readPlainRecord(input, label);

  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error("AI command rejected");
    }

    const descriptor = Object.getOwnPropertyDescriptor(payload, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("AI command rejected");
    }

    readBoundedText(key, label);
    readJsonValue(descriptor.value, label, depth + 1, budget);
  }
}

function readProjectionArray<Value>(
  input: unknown,
  label: string,
  reader: (value: unknown) => Value,
): Value[] {
  return copyPlainArray(input, label, maxAiProjectionItems).map(reader);
}

function readStringArray(input: unknown, label: string): string[] {
  return readProjectionArray(input, label, (value) =>
    readBoundedSafeText(value, label),
  );
}

function copyPlainArray(
  input: unknown,
  label: string,
  maxItems: number,
): unknown[] {
  void label;

  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    throw new Error("AI command rejected");
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxItems
  ) {
    throw new Error("AI command rejected");
  }

  const values: unknown[] = [];

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, lengthDescriptor.value) === null) {
      throw new Error("AI command rejected");
    }
  }

  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("AI command rejected");
    }

    values.push(descriptor.value);
  }

  return values;
}

function readArrayIndex(key: string, length: number): number | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) {
    return null;
  }

  const index = Number(key);

  return Number.isSafeInteger(index) && index >= 0 && index < length
    ? index
    : null;
}

function readExactRecord(
  input: unknown,
  requiredKeys: ReadonlySet<string>,
  label: string,
  optionalKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const payload = readPlainRecord(input, label);
  const ownKeys = Reflect.ownKeys(payload);

  if (
    ownKeys.length < requiredKeys.size ||
    ownKeys.length > requiredKeys.size + optionalKeys.size
  ) {
    throw new Error("AI command rejected");
  }

  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      forbiddenTopLevelFields.has(key) ||
      (!requiredKeys.has(key) && !optionalKeys.has(key))
    ) {
      throw new Error("AI command rejected");
    }

    const descriptor = Object.getOwnPropertyDescriptor(payload, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("AI command rejected");
    }
  }

  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(payload, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("AI command rejected");
    }
  }

  return payload;
}

function readPlainRecord(input: unknown, label: string): Record<string, unknown> {
  void label;

  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error("AI command rejected");
  }

  return input as Record<string, unknown>;
}

function requireKind(input: unknown, expected: string, label: string): void {
  void label;

  if (input !== expected) {
    throw new Error("AI command rejected");
  }
}

function readBoundedText(input: unknown, label: string): string {
  void label;

  if (typeof input !== "string" || input.length > maxAiTextLength) {
    throw new Error("AI command rejected");
  }

  return input;
}

function readBoundedSafeText(input: unknown, label: string): string {
  const value = readBoundedText(input, label);

  if (!isSafeText(value)) {
    throwProviderOutputError();
  }

  return value;
}

function sanitizePublicResult(input: Record<string, unknown>): AiCommandResult {
  return sanitizePublicJson(input) as AiCommandResult;
}

function sanitizePublicJson(input: unknown): unknown {
  if (typeof input === "string") {
    return input.replace(/\bpersist\w*/giu, "storage");
  }

  if (Array.isArray(input)) {
    return input.map(sanitizePublicJson);
  }

  if (
    typeof input === "object" &&
    input !== null &&
    Object.getPrototypeOf(input) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        sanitizePublicJson(value),
      ]),
    );
  }

  return input;
}

function readNonBlankId(input: unknown, label: string): string {
  const value = readBoundedText(input, label);

  if (value.trim().length === 0) {
    throw new Error("AI command rejected");
  }

  return value;
}

function readDateOnly(input: unknown, label: string): string {
  const value = readBoundedSafeText(input, label);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throwProviderOutputError();
  }

  return value;
}

function readConfidence(input: unknown, label: string): number {
  void label;

  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input < 0 ||
    input > 1
  ) {
    throwProviderOutputError();
  }

  return input;
}

function isSafeJsonValue(input: unknown): boolean {
  try {
    assertSafeJsonValue(input);
    return true;
  } catch {
    return false;
  }
}

function assertSafeJsonValue(input: unknown): void {
  const budget = { nodes: 0 };

  assertSafeJsonValueInner(input, 0, budget);
}

function assertSafeJsonValueInner(
  input: unknown,
  depth: number,
  budget: {
    nodes: number;
  },
): void {
  budget.nodes += 1;

  if (budget.nodes > maxJsonNodes || depth > maxJsonDepth) {
    throwProviderOutputError();
  }

  if (
    input === undefined ||
    input === null ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return;
  }

  if (typeof input === "string") {
    if (input.length > maxAiTextLength || !isSafeText(input)) {
      throwProviderOutputError();
    }
    return;
  }

  if (Array.isArray(input)) {
    for (const value of copyPlainArray(input, "output array", maxAiProjectionItems)) {
      assertSafeJsonValueInner(value, depth + 1, budget);
    }
    return;
  }

  const payload = readPlainRecord(input, "output object");

  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== "string" || !isSafeText(key)) {
      throwProviderOutputError();
    }

    const descriptor = Object.getOwnPropertyDescriptor(payload, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throwProviderOutputError();
    }

    assertSafeJsonValueInner(descriptor.value, depth + 1, budget);
  }
}

function isSafeText(input: string): boolean {
  return !(
    /<\s*\/?\s*(?:script|img|iframe|object|embed|svg|a)\b/iu.test(input) ||
    /\bon\w+\s*=/iu.test(input) ||
    /\bjavascript\s*:/iu.test(input) ||
    /\b(?:DROP\s+TABLE|SELECT\s+\*|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/iu.test(input) ||
    /\b(?:ignore\s+previous|override\s+the\s+developer|exfiltrate)\b/iu.test(input)
  );
}

function createResponseSchema(spec: AiCommandSpec): Record<string, unknown> {
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      [...spec.outputKeys].map((key) => [key, {}]),
    ),
    required: [...spec.outputKeys],
    type: "object",
  };
}

function aiFailure(kind: AiFailureKind): AiCommandResult {
  return { kind };
}

function throwProviderOutputError(): never {
  throw new ProviderOutputError();
}

class ProviderOutputError extends Error {
  constructor() {
    super("AI provider output invalid");
  }
}
