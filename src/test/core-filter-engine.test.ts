import { describe, expect, it } from "vitest";

import * as Core from "../core";
import type {
  FilterQuery,
  MarkdownPage,
  MetadataRecord,
  MetadataValueType,
} from "../core";

type RelativeTodayValue = {
  kind: "relative-date";
  value: "today";
};

type ExecuteFilterQueryInput = {
  pages: readonly MarkdownPage[];
  metadata: readonly MetadataRecord[];
  query: FilterQuery;
  currentDate?: string;
};

type ExecuteFilterQuery = (
  input: ExecuteFilterQueryInput,
) => MarkdownPage[];

const taskPluginId = "task";
const tagPluginId = "tag";
const reviewPluginId = "review";
const fixedCurrentDate = "2026-05-21";
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const satisfies RelativeTodayValue;
const baseInstant = "2026-05-21T08:00:00.000Z";

describe("Core filter query execution", () => {
  it("exports a small data-only executeFilterQuery API from the public Core entrypoint", () => {
    expect(readExecuteFilterQuery()).toEqual(expect.any(Function));
  });

  it("executes query objects over current pages and metadata without saved FilterStore records", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const todoTask = page({ id: "page-todo", title: "Todo task" });
    const doneTask = page({ id: "page-done", title: "Done task" });
    const note = page({ id: "page-note", title: "Plain note" });
    const archivedTask = page({
      id: "page-archived",
      title: "Archived task",
      archivedAt: "2026-05-21T09:00:00.000Z",
    });
    const query = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
        { field: "metadata.task.status", op: "neq", value: "done" },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [todoTask, doneTask, note, archivedTask],
        metadata: [
          taskMetadata("enabled", true, todoTask.id, "boolean"),
          taskMetadata("status", "todo", todoTask.id, "string"),
          taskMetadata("enabled", true, doneTask.id, "boolean"),
          taskMetadata("status", "done", doneTask.id, "string"),
          tagMetadata(["product"], note.id),
          taskMetadata("enabled", true, archivedTask.id, "boolean"),
          taskMetadata("status", "todo", archivedTask.id, "string"),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([todoTask.id]);
  });

  it("runs the All Tasks metadata query in stable page order, includes done tasks, and excludes archived pages", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const firstTodo = page({ id: "page-first-todo", title: "First todo" });
    const done = page({ id: "page-done", title: "Done task" });
    const secondTodo = page({ id: "page-second-todo", title: "Second todo" });
    const archived = page({
      id: "page-archived",
      title: "Archived task",
      archivedAt: "2026-05-21T09:00:00.000Z",
    });
    const allTasksQuery = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [firstTodo, done, secondTodo, archived],
        metadata: [
          taskMetadata("enabled", true, firstTodo.id, "boolean"),
          taskMetadata("status", "todo", firstTodo.id, "string"),
          taskMetadata("enabled", true, done.id, "boolean"),
          taskMetadata("status", "done", done.id, "string"),
          taskMetadata("enabled", true, secondTodo.id, "boolean"),
          taskMetadata("status", "todo", secondTodo.id, "string"),
          taskMetadata("enabled", true, archived.id, "boolean"),
          taskMetadata("status", "todo", archived.id, "string"),
        ],
        query: allTasksQuery,
      }).map((result) => result.id),
    ).toStrictEqual([firstTodo.id, done.id, secondTodo.id]);
  });

  it("supports exists, includes, and or conditions for allowlisted metadata fields", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const dueToday = page({ id: "page-due", title: "Due today" });
    const tagged = page({ id: "page-tagged", title: "Tagged product" });
    const other = page({ id: "page-other", title: "Other task" });
    const query = {
      where: [{ field: "metadata.task.enabled", op: "exists" }],
      or: [
        {
          where: [
            {
              field: "metadata.task.due",
              op: "eq",
              value: fixedCurrentDate,
            },
          ],
        },
        {
          where: [
            {
              field: "metadata.tag.tags",
              op: "includes",
              value: "product",
            },
          ],
        },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [dueToday, tagged, other],
        metadata: [
          taskMetadata("enabled", true, dueToday.id, "boolean"),
          taskMetadata("due", fixedCurrentDate, dueToday.id, "date"),
          taskMetadata("enabled", true, tagged.id, "boolean"),
          tagMetadata(["product", "ux"], tagged.id),
          taskMetadata("enabled", true, other.id, "boolean"),
          tagMetadata(["architecture"], other.id),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([dueToday.id, tagged.id]);
  });

  it("keeps TASK-021 tag filters compatible with metadata.tag.tags includes queries", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const product = page({ id: "page-product", title: "Product note" });
    const architecture = page({
      id: "page-architecture",
      title: "Architecture note",
    });
    const query = {
      where: [
        {
          field: "metadata.tag.tags",
          op: "includes",
          value: "product",
        },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [product, architecture],
        metadata: [
          tagMetadata(["product", "mvp"], product.id),
          tagMetadata(["architecture"], architecture.id),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([product.id]);
  });

  it("executes generic metadata queries for arbitrary plugin namespaces and excludes forged owners", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const ready = page({ id: "page-ready-review", title: "Ready review" });
    const forged = page({
      id: "page-forged-review",
      title: "Forged review state",
    });
    const blocked = page({
      id: "page-blocked-review",
      title: "Blocked review",
    });
    const query = {
      where: [
        { field: "metadata.review.state", op: "eq", value: "ready" },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [ready, forged, blocked],
        metadata: [
          reviewMetadata("state", "ready", ready.id, "string", reviewPluginId),
          reviewMetadata("state", "ready", forged.id, "string", taskPluginId),
          reviewMetadata(
            "state",
            "blocked",
            blocked.id,
            "string",
            reviewPluginId,
          ),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([ready.id]);
  });

  it("supports gt and lt comparisons for numeric and date metadata while failing closed for wrong value types", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const ready = page({
      id: "page-high-score-review",
      title: "High score review",
    });
    const tooLow = page({
      id: "page-low-score-review",
      title: "Low score review",
    });
    const tooLate = page({
      id: "page-late-review",
      title: "Late review",
    });
    const stringScore = page({
      id: "page-string-score-review",
      title: "String score review",
    });
    const stringDate = page({
      id: "page-string-date-review",
      title: "String date review",
    });
    const query = {
      where: [
        { field: "metadata.review.score", op: "gt", value: 80 },
        {
          field: "metadata.review.reviewedAt",
          op: "lt",
          value: "2026-05-22",
        },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [ready, tooLow, tooLate, stringScore, stringDate],
        metadata: [
          reviewMetadata("score", 90, ready.id, "number"),
          reviewMetadata("reviewedAt", fixedCurrentDate, ready.id, "date"),
          reviewMetadata("score", 70, tooLow.id, "number"),
          reviewMetadata("reviewedAt", fixedCurrentDate, tooLow.id, "date"),
          reviewMetadata("score", 90, tooLate.id, "number"),
          reviewMetadata("reviewedAt", "2026-05-23", tooLate.id, "date"),
          reviewMetadata("score", 95, stringScore.id, "string"),
          reviewMetadata(
            "reviewedAt",
            fixedCurrentDate,
            stringScore.id,
            "date",
          ),
          reviewMetadata("score", 90, stringDate.id, "number"),
          reviewMetadata(
            "reviewedAt",
            fixedCurrentDate,
            stringDate.id,
            "string",
          ),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([ready.id]);
  });

  it("resolves a JSON-compatible relative today query value against a fixed current local date", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const dueToday = page({ id: "page-due-today", title: "Due today" });
    const scheduledToday = page({
      id: "page-scheduled-today",
      title: "Scheduled today",
    });
    const doneToday = page({ id: "page-done-today", title: "Done today" });
    const future = page({ id: "page-future", title: "Future task" });
    const wrongValueType = page({
      id: "page-wrong-value-type",
      title: "String date",
    });
    const todayQuery = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
        { field: "metadata.task.status", op: "neq", value: "done" },
      ],
      or: [
        {
          where: [
            {
              field: "metadata.task.scheduled",
              op: "eq",
              value: relativeTodayValue,
            },
          ],
        },
        {
          where: [
            {
              field: "metadata.task.due",
              op: "eq",
              value: relativeTodayValue,
            },
          ],
        },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [
          dueToday,
          scheduledToday,
          doneToday,
          future,
          wrongValueType,
        ],
        metadata: [
          taskMetadata("enabled", true, dueToday.id, "boolean"),
          taskMetadata("status", "todo", dueToday.id, "string"),
          taskMetadata("due", fixedCurrentDate, dueToday.id, "date"),
          taskMetadata("enabled", true, scheduledToday.id, "boolean"),
          taskMetadata("status", "todo", scheduledToday.id, "string"),
          taskMetadata(
            "scheduled",
            fixedCurrentDate,
            scheduledToday.id,
            "date",
          ),
          taskMetadata("enabled", true, doneToday.id, "boolean"),
          taskMetadata("status", "done", doneToday.id, "string"),
          taskMetadata("due", fixedCurrentDate, doneToday.id, "date"),
          taskMetadata("enabled", true, future.id, "boolean"),
          taskMetadata("status", "todo", future.id, "string"),
          taskMetadata("due", "2026-05-22", future.id, "date"),
          taskMetadata("enabled", true, wrongValueType.id, "boolean"),
          taskMetadata("status", "todo", wrongValueType.id, "string"),
          taskMetadata("due", fixedCurrentDate, wrongValueType.id, "string"),
        ],
        query: todayQuery,
        currentDate: fixedCurrentDate,
      }).map((result) => result.id),
    ).toStrictEqual([dueToday.id, scheduledToday.id]);
  });

  it("fails closed when metadata neq relative today compares against wrong-typed date metadata", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const future = page({ id: "page-future-due", title: "Future due" });
    const today = page({ id: "page-today-due", title: "Today due" });
    const wrongValueType = page({
      id: "page-string-future-due",
      title: "String future due",
    });
    const query = {
      where: [
        {
          field: "metadata.task.due",
          op: "neq",
          value: relativeTodayValue,
        },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [future, today, wrongValueType],
        metadata: [
          taskMetadata("due", "2026-05-22", future.id, "date"),
          taskMetadata("due", fixedCurrentDate, today.id, "date"),
          taskMetadata("due", "2026-05-22", wrongValueType.id, "string"),
        ],
        query,
        currentDate: fixedCurrentDate,
      }).map((result) => result.id),
    ).toStrictEqual([future.id]);
  });

  it("does not mutate pages, metadata, or query inputs while executing", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const pages = [page({ id: "page-task", title: "Task" })];
    const metadata = [
      taskMetadata("enabled", true, "page-task", "boolean"),
    ];
    const query = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
      ],
    } satisfies FilterQuery;
    const beforePages = cloneJson(pages);
    const beforeMetadata = cloneJson(metadata);
    const beforeQuery = cloneJson(query);

    executeFilterQuery({ pages, metadata, query });

    expect(pages).toStrictEqual(beforePages);
    expect(metadata).toStrictEqual(beforeMetadata);
    expect(query).toStrictEqual(beforeQuery);
  });

  it("prefers owner-consistent metadata records and ignores forged plugin ownership", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const legitimate = page({ id: "page-legitimate", title: "Legitimate" });
    const forgedOnly = page({ id: "page-forged", title: "Forged only" });
    const conflicting = page({
      id: "page-conflicting",
      title: "Conflicting owner",
    });
    const query = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
      ],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [legitimate, forgedOnly, conflicting],
        metadata: [
          taskMetadata("enabled", true, legitimate.id, "boolean", taskPluginId),
          taskMetadata("enabled", true, forgedOnly.id, "boolean", tagPluginId),
          taskMetadata("enabled", false, conflicting.id, "boolean", taskPluginId),
          taskMetadata("enabled", true, conflicting.id, "boolean", tagPluginId),
        ],
        query,
      }).map((result) => result.id),
    ).toStrictEqual([legitimate.id]);
  });

  it.each([
    "__proto__",
    "constructor",
    "prototype",
    "metadata.__proto__.enabled",
    "metadata.constructor.enabled",
    "metadata.prototype.enabled",
    "metadata.task.__proto__",
    "metadata.task.constructor",
    "metadata.task.enabled.__proto__",
  ])("fails closed for unknown or path-injection field %s", (field) => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const task = page({ id: "page-task", title: "Task" });
    const query = {
      where: [{ field, op: "exists" }],
    } satisfies FilterQuery;

    expect(
      executeFilterQuery({
        pages: [task],
        metadata: [
          taskMetadata("enabled", true, task.id, "boolean"),
          taskMetadata("status", "todo", task.id, "string"),
        ],
        query,
      }),
    ).toStrictEqual([]);
  });
});

function readExecuteFilterQuery(): ExecuteFilterQuery | undefined {
  const coreExports = Core as typeof Core & {
    executeFilterQuery?: ExecuteFilterQuery;
  };

  return coreExports.executeFilterQuery;
}

function requireExecuteFilterQuery(): ExecuteFilterQuery {
  const executeFilterQuery = readExecuteFilterQuery();

  if (executeFilterQuery === undefined) {
    throw new Error("Core must export executeFilterQuery from ../core");
  }

  return executeFilterQuery;
}

function page(
  input: Pick<MarkdownPage, "id" | "title"> &
    Partial<Omit<MarkdownPage, "id" | "title">>,
): MarkdownPage {
  return {
    id: input.id,
    title: input.title,
    body: input.body ?? {
      type: "doc",
      content: [],
    },
    createdAt: input.createdAt ?? baseInstant,
    updatedAt: input.updatedAt ?? baseInstant,
    ...(input.parentPageId === undefined
      ? {}
      : {
          parentPageId: input.parentPageId,
        }),
    ...(input.archivedAt === undefined
      ? {}
      : {
          archivedAt: input.archivedAt,
        }),
  };
}

function taskMetadata(
  key: string,
  value: unknown,
  pageId: string,
  valueType: MetadataValueType,
  sourcePluginId = taskPluginId,
): MetadataRecord {
  return metadata({
    pageId,
    namespace: "task",
    key,
    value,
    valueType,
    sourcePluginId,
  });
}

function tagMetadata(tags: readonly string[], pageId: string): MetadataRecord {
  return metadata({
    pageId,
    namespace: "tag",
    key: "tags",
    value: [...tags],
    valueType: "json",
    sourcePluginId: tagPluginId,
  });
}

function reviewMetadata(
  key: string,
  value: unknown,
  pageId: string,
  valueType: MetadataValueType,
  sourcePluginId = reviewPluginId,
): MetadataRecord {
  return metadata({
    pageId,
    namespace: "review",
    key,
    value,
    valueType,
    sourcePluginId,
  });
}

function metadata(input: {
  pageId: string;
  namespace: string;
  key: string;
  value: unknown;
  valueType: MetadataValueType;
  sourcePluginId: string;
}): MetadataRecord {
  return {
    id: `metadata-${input.pageId}-${input.namespace}-${input.key}-${input.sourcePluginId}`,
    pageId: input.pageId,
    namespace: input.namespace,
    key: input.key,
    value: input.value,
    valueType: input.valueType,
    sourcePluginId: input.sourcePluginId,
    createdAt: baseInstant,
    updatedAt: baseInstant,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
