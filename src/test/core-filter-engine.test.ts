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
  metadataOwnerReservations?: readonly MetadataOwnerReservation[];
};

type ExecuteFilterQuery = (
  input: ExecuteFilterQueryInput,
) => MarkdownPage[];

type MetadataOwnerReservation = {
  namespace: string;
  sourcePluginId: string;
};

const taskPluginId = "task";
const tagPluginId = "tag";
const reviewPluginId = "review";
const profilePluginId = "profile-plugin";
const fixedCurrentDate = "2026-05-21";
const relativeTodayValue = {
  kind: "relative-date",
  value: "today",
} as const satisfies RelativeTodayValue;
const baseInstant = "2026-05-21T08:00:00.000Z";
const builtInMetadataOwnerReservations = [
  {
    namespace: taskPluginId,
    sourcePluginId: taskPluginId,
  },
  {
    namespace: tagPluginId,
    sourcePluginId: tagPluginId,
  },
] as const satisfies readonly MetadataOwnerReservation[];

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

  it("executes generic metadata when source ownership differs from namespace while preserving built-in owner boundaries", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const publicProfile = page({
      id: "page-public-profile",
      title: "Public profile",
    });
    const privateProfile = page({
      id: "page-private-profile",
      title: "Private profile",
    });
    const taskOwnedProfile = page({
      id: "page-task-owned-profile",
      title: "Task-owned profile metadata",
    });
    const legitimateTask = page({
      id: "page-legitimate-task",
      title: "Legitimate task",
    });
    const forgedTask = page({
      id: "page-forged-task",
      title: "Forged task metadata",
    });
    const legitimateTagged = page({
      id: "page-legitimate-tagged",
      title: "Legitimate tagged page",
    });
    const forgedTagged = page({
      id: "page-forged-tagged",
      title: "Forged tag metadata",
    });
    const profileQuery = {
      where: [
        {
          field: "metadata.profile.visibility",
          op: "eq",
          value: "public",
        },
      ],
    } satisfies FilterQuery;
    const taskQuery = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
      ],
    } satisfies FilterQuery;
    const tagQuery = {
      where: [
        {
          field: "metadata.tag.tags",
          op: "includes",
          value: "product",
        },
      ],
    } satisfies FilterQuery;
    const metadataRecords = [
      profileMetadata(
        "visibility",
        "public",
        publicProfile.id,
        "string",
        profilePluginId,
      ),
      profileMetadata(
        "visibility",
        "private",
        privateProfile.id,
        "string",
        profilePluginId,
      ),
      profileMetadata(
        "visibility",
        "public",
        taskOwnedProfile.id,
        "string",
        taskPluginId,
      ),
      taskMetadata("enabled", true, legitimateTask.id, "boolean"),
      taskMetadata("enabled", true, forgedTask.id, "boolean", profilePluginId),
      tagMetadata(["product"], legitimateTagged.id),
      metadata({
        pageId: forgedTagged.id,
        namespace: "tag",
        key: "tags",
        value: ["product"],
        valueType: "json",
        sourcePluginId: profilePluginId,
      }),
    ];

    expect(
      executeFilterQuery({
        pages: [
          publicProfile,
          privateProfile,
          taskOwnedProfile,
          legitimateTask,
          forgedTask,
          legitimateTagged,
          forgedTagged,
        ],
        metadata: metadataRecords,
        query: profileQuery,
      }).map((result) => result.id),
    ).toStrictEqual([publicProfile.id, taskOwnedProfile.id]);
    expect(
      executeFilterQuery({
        pages: [legitimateTask, forgedTask],
        metadata: metadataRecords,
        query: taskQuery,
      }).map((result) => result.id),
    ).toStrictEqual([legitimateTask.id]);
    expect(
      executeFilterQuery({
        pages: [legitimateTagged, forgedTagged],
        metadata: metadataRecords,
        query: tagQuery,
      }).map((result) => result.id),
    ).toStrictEqual([legitimateTagged.id]);
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

  it.each([
    {
      name: "number gt",
      key: "score",
      value: 10,
      valueType: "number",
      op: "gt",
      operand: 9,
    },
    {
      name: "number lt",
      key: "score",
      value: 10,
      valueType: "number",
      op: "lt",
      operand: 11,
    },
    {
      name: "date gt",
      key: "reviewedAt",
      value: "2026-05-22",
      valueType: "date",
      op: "gt",
      operand: "2026-05-21",
    },
    {
      name: "date lt",
      key: "reviewedAt",
      value: "2026-05-20",
      valueType: "date",
      op: "lt",
      operand: "2026-05-21",
    },
  ] as const)(
    "supports the $name comparison path",
    ({ key, value, valueType, op, operand }) => {
      const executeFilterQuery = requireExecuteFilterQuery();
      const matching = page({
        id: `page-review-${op}-${valueType}`,
        title: `${op} ${valueType}`,
      });
      const query = {
        where: [
          {
            field: `metadata.review.${key}`,
            op,
            value: operand,
          },
        ],
      } satisfies FilterQuery;

      expect(
        executeFilterQuery({
          pages: [matching],
          metadata: [
            reviewMetadata(key, value, matching.id, valueType),
          ],
          query,
        }).map((result) => result.id),
      ).toStrictEqual([matching.id]);
    },
  );

  it.each([
    {
      name: "number metadata with string operand",
      key: "score",
      value: 10,
      valueType: "number",
      op: "gt",
      operand: "9",
    },
    {
      name: "date metadata with number operand",
      key: "reviewedAt",
      value: "2026-05-22",
      valueType: "date",
      op: "lt",
      operand: 20260523,
    },
  ] as const)(
    "fails closed for wrong gt/lt query operand type: $name",
    ({ key, value, valueType, op, operand }) => {
      const executeFilterQuery = requireExecuteFilterQuery();
      const candidate = page({
        id: `page-wrong-${op}-${valueType}-operand`,
        title: `Wrong ${op} operand`,
      });
      const query = {
        where: [
          {
            field: `metadata.review.${key}`,
            op,
            value: operand,
          },
        ],
      } satisfies FilterQuery;

      expect(
        executeFilterQuery({
          pages: [candidate],
          metadata: [
            reviewMetadata(key, value, candidate.id, valueType),
          ],
          query,
        }),
      ).toStrictEqual([]);
    },
  );

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

  it.each([
    {
      op: "eq",
      operand: "not-a-date",
    },
    {
      op: "neq",
      operand: fixedCurrentDate,
    },
  ] as const)(
    "fails closed for raw $op comparisons against malformed date metadata",
    ({ op, operand }) => {
      const executeFilterQuery = requireExecuteFilterQuery();
      const malformedDate = page({
        id: `page-malformed-date-${op}`,
        title: `Malformed date ${op}`,
      });
      const query = {
        where: [
          {
            field: "metadata.review.reviewedAt",
            op,
            value: operand,
          },
        ],
      } satisfies FilterQuery;

      expect(
        executeFilterQuery({
          pages: [malformedDate],
          metadata: [
            reviewMetadata(
              "reviewedAt",
              "not-a-date",
              malformedDate.id,
              "date",
            ),
          ],
          query,
        }),
      ).toStrictEqual([]);
    },
  );

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

  it.each(["and", "or"] as const)(
    "fails closed without throwing when a direct query %s branch references itself",
    (branch) => {
      const executeFilterQuery = requireExecuteFilterQuery();
      const task = page({ id: `page-cyclic-${branch}`, title: "Cyclic task" });
      const query: {
        where: Array<{ field: string; op: "eq"; value: boolean }>;
        and?: unknown[];
        or?: unknown[];
      } = {
        where: [
          { field: "metadata.task.enabled", op: "eq", value: true },
        ],
      };
      query[branch] = [query];
      let results: MarkdownPage[] | undefined;

      expect(() => {
        results = executeFilterQuery({
          pages: [task],
          metadata: [
            taskMetadata("enabled", true, task.id, "boolean"),
          ],
          query: query as unknown as FilterQuery,
        });
      }).not.toThrow();
      expect(results).toStrictEqual([]);
    },
  );

  it("fails closed without throwing for over-deep direct query objects", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const task = page({ id: "page-over-deep-query", title: "Deep task" });
    let results: MarkdownPage[] | undefined;

    expect(() => {
      results = executeFilterQuery({
        pages: [task],
        metadata: [taskMetadata("enabled", true, task.id, "boolean")],
        query: deeplyNestedQuery(1_500),
      });
    }).not.toThrow();
    expect(results).toStrictEqual([]);
  });

  it("fails closed for direct query operator/value shapes rejected by saved filters", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const task = page({ id: "page-invalid-condition-shape", title: "Task" });
    const metadataRecords = [
      taskMetadata("enabled", true, task.id, "boolean"),
      taskMetadata("status", "todo", task.id, "string"),
      taskMetadata("priority", 3, task.id, "number"),
      tagMetadata(["product"], task.id),
    ];
    const existsWithValue = {
      where: [
        {
          field: "metadata.task.enabled",
          op: "exists",
          value: true,
        },
      ],
    } as unknown as FilterQuery;

    expect(
      executeFilterQuery({
        pages: [task],
        metadata: metadataRecords,
        query: existsWithValue,
      }),
    ).toStrictEqual([]);

    for (const op of ["eq", "neq", "gt", "lt", "includes"] as const) {
      const missingValueQuery = {
        where: [{ field: "metadata.task.status", op }],
      } as unknown as FilterQuery;

      expect(
        executeFilterQuery({
          pages: [task],
          metadata: metadataRecords,
          query: missingValueQuery,
        }),
      ).toStrictEqual([]);
    }
  });

  it.each([
    {
      name: "eq boolean stored as string metadata",
      field: "metadata.review.flag",
      value: true,
      valueType: "string",
      op: "eq",
      operand: true,
    },
    {
      name: "neq number stored as string metadata",
      field: "metadata.review.score",
      value: 10,
      valueType: "string",
      op: "neq",
      operand: 11,
    },
    {
      name: "includes array stored as string metadata",
      field: "metadata.review.tags",
      value: ["product"],
      valueType: "string",
      op: "includes",
      operand: "product",
    },
  ] as const)(
    "fails closed for metadata valueType and stored value shape mismatch: $name",
    ({ field, value, valueType, op, operand }) => {
      const executeFilterQuery = requireExecuteFilterQuery();
      const candidate = page({
        id: `page-${op}-wrong-value-type`,
        title: `Wrong ${op} value type`,
      });
      const key = field.split(".")[2];

      if (key === undefined) {
        throw new Error(`Invalid test field ${field}`);
      }

      const query = {
        where: [{ field, op, value: operand }],
      } satisfies FilterQuery;

      expect(
        executeFilterQuery({
          pages: [candidate],
          metadata: [
            reviewMetadata(key, value, candidate.id, valueType),
          ],
          query,
        }),
      ).toStrictEqual([]);
    },
  );

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

  it("uses metadataOwnerReservations as the explicit generic metadata ownership switch", () => {
    const executeFilterQuery = requireExecuteFilterQuery();
    const forgedBuiltIn = page({
      id: "page-forged-built-in-metadata",
      title: "Forged built-in metadata",
    });
    const query = {
      where: [
        { field: "metadata.task.enabled", op: "eq", value: true },
      ],
    } satisfies FilterQuery;
    const forgedMetadata = [
      taskMetadata(
        "enabled",
        true,
        forgedBuiltIn.id,
        "boolean",
        reviewPluginId,
      ),
    ];

    expect(
      executeFilterQuery({
        pages: [forgedBuiltIn],
        metadata: forgedMetadata,
        query,
        metadataOwnerReservations: [],
      }).map((result) => result.id),
    ).toStrictEqual([forgedBuiltIn.id]);
    expect(
      executeFilterQuery({
        pages: [forgedBuiltIn],
        metadata: forgedMetadata,
        query,
        metadataOwnerReservations: [
          { namespace: "task", sourcePluginId: "task" },
        ],
      }),
    ).toStrictEqual([]);
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

  return (input) =>
    executeFilterQuery({
      ...input,
      metadataOwnerReservations:
        input.metadataOwnerReservations ?? builtInMetadataOwnerReservations,
    });
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

function profileMetadata(
  key: string,
  value: unknown,
  pageId: string,
  valueType: MetadataValueType,
  sourcePluginId = profilePluginId,
): MetadataRecord {
  return metadata({
    pageId,
    namespace: "profile",
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

function deeplyNestedQuery(depth: number): FilterQuery {
  let query: Record<string, unknown> = {
    where: [
      { field: "metadata.task.enabled", op: "eq", value: true },
    ],
  };

  for (let index = 0; index < depth; index += 1) {
    query = {
      where: [],
      and: [query],
    };
  }

  return query as unknown as FilterQuery;
}
