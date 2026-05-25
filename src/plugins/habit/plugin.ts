import type {
  AppEvent,
  AppPlugin,
  BlockNode,
  MarkdownPage,
  PluginContext,
  PluginFilterQuery,
  PluginMetadataStore,
  PluginSaveFilterInput,
  PluginTransaction,
} from "../../core";

type HabitPageInput = {
  pageId: string;
};

type HabitFrequencyInput = HabitPageInput & {
  frequency: "daily";
};

type HabitRefreshResult =
  | {
      enabled: true;
      frequency: "daily";
      nextDue: string;
      pageId: string;
    }
  | {
      enabled: false;
      pageId: string;
    };

type HabitCheckResult = {
  checked: true;
  date: string;
  nextDue: string;
  pageId: string;
};

type HabitUncheckResult = {
  checked: false;
  date: string;
  nextDue: string;
  pageId: string;
};

type HabitFrequencyResult = {
  frequency: "daily";
  pageId: string;
};

type SourceLine = {
  text: string;
};

type HabitDefaultFilterInput = PluginSaveFilterInput & {
  id: string;
};

const habitPluginId = "habit";
const habitNamespace = "habit";
const refreshHabitCommandId = "habit.refresh-habit";
const checkTodayCommandId = "habit.check-today";
const uncheckTodayCommandId = "habit.uncheck-today";
const setFrequencyCommandId = "habit.set-frequency";
const habitsFilterId = "habit.filter.habits";
const todayHabitsFilterId = "habit.filter.today-habits";
const pageListViewType = "page.list";
const dailyFrequency = "daily";
const habitValueTypeBoolean = "boolean";
const habitValueTypeString = "string";
const habitValueTypeDate = "date";
const habitPageInputKeys = new Set(["pageId"]);
const habitFrequencyInputKeys = new Set(["pageId", "frequency"]);
const unsafePayloadKeys = new Set(["__proto__", "constructor", "prototype"]);
const fenceLinePattern = /^\s{0,3}(?<fence>`{3,}|~{3,})/u;
const sourceTokenTrailingPunctuationPattern = /[.,;!?)}\]]+$/u;
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const;
const habitsFilterQuery = {
  where: [{ field: "metadata.habit.enabled", op: "eq", value: true }],
} satisfies PluginFilterQuery;
const todayHabitsFilterQuery = {
  where: [
    { field: "metadata.habit.enabled", op: "eq", value: true },
    { field: "metadata.habit.frequency", op: "eq", value: dailyFrequency },
  ],
  or: [
    {
      where: [
        {
          field: "metadata.habit.nextDue",
          op: "eq",
          value: relativeTodayValue,
        },
      ],
    },
    {
      where: [
        {
          field: "metadata.habit.nextDue",
          op: "lt",
          value: relativeTodayValue,
        },
      ],
    },
  ],
} satisfies PluginFilterQuery;

export const HabitPlugin: AppPlugin = {
  manifest: {
    id: habitPluginId,
    name: "Habit Plugin",
    version: "1.0.0",
    description: "Recognize daily habit pages and record completions.",
    minAppVersion: "0.1.0",
    contributes: {
      markdownSyntax: [
        {
          id: "habit.hashtag",
          name: "Habit hashtag",
          syntax: "#habit",
        },
      ],
      metadataFields: [
        {
          id: "habit.enabled",
          namespace: habitNamespace,
          key: "enabled",
          valueType: habitValueTypeBoolean,
        },
        {
          id: "habit.frequency",
          namespace: habitNamespace,
          key: "frequency",
          valueType: habitValueTypeString,
        },
        {
          id: "habit.lastCheckedAt",
          namespace: habitNamespace,
          key: "lastCheckedAt",
          valueType: habitValueTypeDate,
        },
        {
          id: "habit.nextDue",
          namespace: habitNamespace,
          key: "nextDue",
          valueType: habitValueTypeDate,
        },
      ],
    },
  },
  register(ctx) {
    registerHabitFilters(ctx);

    ctx.commands.register({
      id: refreshHabitCommandId,
      title: "Refresh habit",
      handler: refreshHabit,
    });

    ctx.commands.register({
      id: checkTodayCommandId,
      title: "Check today",
      handler: checkToday,
    });

    ctx.commands.register({
      id: uncheckTodayCommandId,
      title: "Uncheck today",
      handler: uncheckToday,
    });

    ctx.commands.register({
      id: setFrequencyCommandId,
      title: "Set frequency",
      handler: setFrequency,
    });
  },
};

function registerHabitFilters(ctx: PluginContext): void {
  upsertHabitDefaultFilter(ctx, {
    id: habitsFilterId,
    name: "Habits",
    query: habitsFilterQuery,
    viewType: pageListViewType,
  });
  upsertHabitDefaultFilter(ctx, {
    id: todayHabitsFilterId,
    name: "Today Habits",
    query: todayHabitsFilterQuery,
    viewType: pageListViewType,
  });
}

function upsertHabitDefaultFilter(
  ctx: PluginContext,
  filter: HabitDefaultFilterInput,
): void {
  try {
    ctx.filters.get(filter.id);
  } catch {
    ctx.filters.save(filter);
    return;
  }

  ctx.filters.update(filter.id, {
    name: filter.name,
    query: filter.query,
    sort: null,
    group: null,
    viewType: filter.viewType,
  });
}

function refreshHabit(
  input: unknown,
  ctx: PluginContext,
): Promise<HabitRefreshResult> {
  const payload = readHabitPageInput(input, refreshHabitCommandId);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);

    if (!isTrustedHabitPage(tx, page)) {
      return {
        enabled: false,
        pageId: page.id,
      };
    }

    const today = currentLocalDateOnly();

    const nextDue = readOwnedDateMetadata(tx.metadata, page.id, "nextDue") ?? today;

    writeDailyHabitMetadata(tx.metadata, page.id, { nextDue });

    return {
      enabled: true,
      frequency: dailyFrequency,
      nextDue,
      pageId: page.id,
    };
  });
}

function checkToday(
  input: unknown,
  ctx: PluginContext,
): Promise<HabitCheckResult> {
  const payload = readHabitPageInput(input, checkTodayCommandId);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);

    requireTrustedHabitPage(tx, page);

    const today = currentLocalDateOnly();
    const nextDue = addLocalDays(today, 1);

    writeDailyHabitMetadata(tx.metadata, page.id, {
      lastCheckedAt: today,
      nextDue,
    });

    if (
      readLatestHabitCompletionEventTypeForDate(tx, page.id, today) !==
      "checked"
    ) {
      tx.events.append({
        pageId: page.id,
        namespace: habitNamespace,
        type: "checked",
        payload: {
          habitPageId: page.id,
          date: today,
        },
      });
    }

    return {
      checked: true,
      date: today,
      nextDue,
      pageId: page.id,
    };
  });
}

function uncheckToday(
  input: unknown,
  ctx: PluginContext,
): Promise<HabitUncheckResult> {
  const payload = readHabitPageInput(input, uncheckTodayCommandId);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);

    requireTrustedHabitPage(tx, page);

    const today = currentLocalDateOnly();

    writeDailyHabitMetadata(tx.metadata, page.id, {
      nextDue: today,
    });
    deleteLastCheckedAtForDate(tx.metadata, page.id, today);
    tx.events.append({
      pageId: page.id,
      namespace: habitNamespace,
      type: "unchecked",
      payload: {
        habitPageId: page.id,
        date: today,
      },
    });

    return {
      checked: false,
      date: today,
      nextDue: today,
      pageId: page.id,
    };
  });
}

function setFrequency(
  input: unknown,
  ctx: PluginContext,
): Promise<HabitFrequencyResult> {
  const payload = readHabitFrequencyInput(input);

  return ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);

    requireTrustedHabitPage(tx, page);
    tx.metadata.set({
      pageId: page.id,
      namespace: habitNamespace,
      key: "frequency",
      value: payload.frequency,
      valueType: habitValueTypeString,
    });

    return {
      frequency: payload.frequency,
      pageId: page.id,
    };
  });
}

function readHabitPageInput(input: unknown, commandId: string): HabitPageInput {
  const payload = readExactRecord(input, habitPageInputKeys, `${commandId} input`);
  const pageId = payload.pageId;

  if (typeof pageId !== "string" || pageId.trim().length === 0) {
    throw new Error(`${commandId} requires pageId`);
  }

  return { pageId };
}

function readHabitFrequencyInput(input: unknown): HabitFrequencyInput {
  const payload = readExactRecord(
    input,
    habitFrequencyInputKeys,
    `${setFrequencyCommandId} input`,
  );
  const pageId = payload.pageId;
  const frequency = payload.frequency;

  if (typeof pageId !== "string" || pageId.trim().length === 0) {
    throw new Error(`${setFrequencyCommandId} requires pageId`);
  }

  if (frequency !== dailyFrequency) {
    throw new Error(`${setFrequencyCommandId} requires daily frequency`);
  }

  return { frequency, pageId };
}

function readExactRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${label} must be an object`);
  }

  if (Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (ownKeys.length !== allowedKeys.size) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new Error(`${label} contains untrusted fields`);
    }

    if (unsafePayloadKeys.has(key) || !allowedKeys.has(key)) {
      throw new Error(`${label} contains untrusted fields`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} contains untrusted fields`);
    }
  }

  for (const key of allowedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  return input;
}

function requireTrustedHabitPage(
  tx: PluginTransaction,
  page: MarkdownPage,
): void {
  if (!isTrustedHabitPage(tx, page)) {
    throw new Error("Habit command requires a trusted habit page");
  }
}

function isTrustedHabitPage(
  tx: PluginTransaction,
  page: MarkdownPage,
): boolean {
  return hasHabitSyntax(page) || hasOwnedEnabledMetadata(tx.metadata, page.id);
}

function hasOwnedEnabledMetadata(
  metadata: PluginMetadataStore,
  pageId: string,
): boolean {
  return metadata
    .list({ pageId, namespace: habitNamespace, key: "enabled" })
    .some(
      (record) =>
        record.valueType === habitValueTypeBoolean && record.value === true,
    );
}

function writeDailyHabitMetadata(
  metadata: PluginMetadataStore,
  pageId: string,
  dates: {
    nextDue: string;
    lastCheckedAt?: string;
  },
): void {
  metadata.set({
    pageId,
    namespace: habitNamespace,
    key: "enabled",
    value: true,
    valueType: habitValueTypeBoolean,
  });
  metadata.set({
    pageId,
    namespace: habitNamespace,
    key: "frequency",
    value: dailyFrequency,
    valueType: habitValueTypeString,
  });
  metadata.set({
    pageId,
    namespace: habitNamespace,
    key: "nextDue",
    value: dates.nextDue,
    valueType: habitValueTypeDate,
  });

  if (dates.lastCheckedAt !== undefined) {
    metadata.set({
      pageId,
      namespace: habitNamespace,
      key: "lastCheckedAt",
      value: dates.lastCheckedAt,
      valueType: habitValueTypeDate,
    });
  }
}

function readOwnedDateMetadata(
  metadata: PluginMetadataStore,
  pageId: string,
  key: string,
): string | undefined {
  const record = metadata.list({ pageId, namespace: habitNamespace, key })[0];

  return record?.valueType === habitValueTypeDate &&
    typeof record.value === "string" &&
    isDateOnly(record.value)
    ? record.value
    : undefined;
}

function deleteLastCheckedAtForDate(
  metadata: PluginMetadataStore,
  pageId: string,
  date: string,
): void {
  const existing = readOwnedDateMetadata(metadata, pageId, "lastCheckedAt");

  if (existing === date) {
    metadata.delete(pageId, habitNamespace, "lastCheckedAt");
  }
}

function readLatestHabitCompletionEventTypeForDate(
  tx: PluginTransaction,
  pageId: string,
  date: string,
): "checked" | "unchecked" | undefined {
  const events = tx.events.list({ pageId, namespace: habitNamespace });

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (isHabitCompletionEvent(event, pageId, date, "checked")) {
      return "checked";
    }

    if (isHabitCompletionEvent(event, pageId, date, "unchecked")) {
      return "unchecked";
    }
  }

  return undefined;
}

function isHabitCompletionEvent(
  event: AppEvent,
  pageId: string,
  date: string,
  type: "checked" | "unchecked",
): boolean {
  if (event.type !== type || !isRecord(event.payload)) {
    return false;
  }

  const keys = Object.keys(event.payload).sort();

  return (
    keys.length === 2 &&
    keys[0] === "date" &&
    keys[1] === "habitPageId" &&
    event.payload.date === date &&
    event.payload.habitPageId === pageId
  );
}

function hasHabitSyntax(page: MarkdownPage): boolean {
  if (lineHasHabitSyntax(page.title)) {
    return true;
  }

  let activeFence: string | undefined;

  for (const line of readSourceLines(page.body.content)) {
    const fence = matchFenceMarker(line.text);

    if (fence !== undefined) {
      if (activeFence === undefined) {
        activeFence = fence;
      } else if (
        fence[0] === activeFence[0] &&
        fence.length >= activeFence.length
      ) {
        activeFence = undefined;
      }

      continue;
    }

    if (activeFence === undefined && lineHasHabitSyntax(line.text)) {
      return true;
    }
  }

  return false;
}

function readSourceLines(blocks: readonly BlockNode[]): SourceLine[] {
  return blocks.flatMap((block) => {
    if (block.type !== "markdown.line" || typeof block.text !== "string") {
      return [];
    }

    return [{ text: block.text }];
  });
}

function lineHasHabitSyntax(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "#") {
      continue;
    }

    if (
      isEscapedHash(line, index) ||
      !hasSyntaxBoundary(line, index) ||
      isInsideMarkupLikeFragment(line, index)
    ) {
      continue;
    }

    const sourceToken = readSourceToken(line, index + 1);
    const token = sourceToken.replace(sourceTokenTrailingPunctuationPattern, "");

    if (token === habitPluginId) {
      return true;
    }

    index += sourceToken.length;
  }

  return false;
}

function isEscapedHash(line: string, index: number): boolean {
  return index > 0 && line[index - 1] === "\\";
}

function hasSyntaxBoundary(line: string, index: number): boolean {
  return index === 0 || /\s/u.test(line[index - 1] ?? "");
}

function readSourceToken(line: string, startIndex: number): string {
  let token = "";

  for (let index = startIndex; index < line.length; index += 1) {
    const character = line[index] ?? "";

    if (/\s/u.test(character)) {
      break;
    }

    token += character;
  }

  return token;
}

function isInsideMarkupLikeFragment(line: string, index: number): boolean {
  const openingBracketIndex = line.lastIndexOf("<", index);
  const closingBracketIndex = line.lastIndexOf(">", index);

  if (openingBracketIndex === -1 || openingBracketIndex < closingBracketIndex) {
    return false;
  }

  const closeIndex = line.indexOf(">", index);

  return closeIndex !== -1;
}

function matchFenceMarker(line: string): string | undefined {
  return fenceLinePattern.exec(line)?.groups?.fence;
}

function currentLocalDateOnly(): string {
  const now = new Date();

  return formatLocalDate(now);
}

function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  const localDate = new Date(year, month - 1, day + days);

  return formatLocalDate(localDate);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  return addLocalDays(value, 0) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
