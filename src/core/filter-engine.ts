import type {
  FilterQuery,
  MarkdownPage,
  MetadataRecord,
  MetadataValueType,
} from "./types";

export type ExecuteFilterQueryInput = {
  pages: readonly MarkdownPage[];
  metadata: readonly MetadataRecord[];
  query: FilterQuery;
  currentDate?: string;
};

type MetadataField = {
  namespace: string;
  key: string;
};

type FieldValue = {
  value: unknown;
  valueType: MetadataValueType;
};

type OptionalDataProperty =
  | {
      present: false;
    }
  | {
      present: true;
      value: unknown;
    };

type ComparableValue =
  | {
      comparable: false;
    }
  | {
      comparable: true;
      value: unknown;
      requiresDateMetadata: boolean;
    };

const metadataFieldPrefix = "metadata";
const unsafeFieldSegments = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const metadataFieldSegmentPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/u;

export function executeFilterQuery(
  input: ExecuteFilterQueryInput,
): MarkdownPage[] {
  const currentDate = input.currentDate ?? createCurrentLocalDate();

  return input.pages.filter(
    (page) =>
      page.archivedAt === undefined &&
      matchesFilterQuery(page, input.metadata, input.query, currentDate),
  );
}

function matchesFilterQuery(
  page: MarkdownPage,
  metadata: readonly MetadataRecord[],
  query: unknown,
  currentDate: string,
): boolean {
  if (!isRecord(query)) {
    return false;
  }

  const where = readDataArrayProperty(query, "where");

  if (where === undefined) {
    return false;
  }

  const whereMatches = where.every((condition) =>
    matchesFilterCondition(page, metadata, condition, currentDate),
  );

  if (!whereMatches) {
    return false;
  }

  const andBranches = readDataProperty(query, "and");

  if (andBranches.present) {
    if (
      !Array.isArray(andBranches.value) ||
      !andBranches.value.every((branch) =>
        matchesFilterQuery(page, metadata, branch, currentDate),
      )
    ) {
      return false;
    }
  }

  const orBranches = readDataProperty(query, "or");

  if (!orBranches.present) {
    return true;
  }

  return (
    Array.isArray(orBranches.value) &&
    orBranches.value.some((branch) =>
      matchesFilterQuery(page, metadata, branch, currentDate),
    )
  );
}

function matchesFilterCondition(
  page: MarkdownPage,
  metadata: readonly MetadataRecord[],
  condition: unknown,
  currentDate: string,
): boolean {
  if (!isRecord(condition)) {
    return false;
  }

  const field = readStringDataProperty(condition, "field");
  const op = readStringDataProperty(condition, "op");

  if (field === undefined || op === undefined) {
    return false;
  }

  const metadataField = parseMetadataField(field);

  if (metadataField === undefined) {
    return false;
  }

  const fieldValue = resolveMetadataField(page.id, metadata, metadataField);

  if (fieldValue === undefined) {
    return false;
  }

  if (op === "exists") {
    return true;
  }

  const conditionValue = readDataProperty(condition, "value");

  if (!conditionValue.present) {
    return false;
  }

  const comparable = resolveComparableValue(conditionValue.value, currentDate);

  if (!comparable.comparable) {
    return false;
  }

  switch (op) {
    case "eq":
      return valuesEqual(fieldValue, comparable);
    case "neq":
      return !valuesEqual(fieldValue, comparable);
    case "includes":
      return valueIncludes(fieldValue, comparable);
    case "gt":
    case "lt":
    case "within":
      return false;
    default:
      return false;
  }
}

function parseMetadataField(field: string): MetadataField | undefined {
  const segments = field.split(".");

  if (segments.length !== 3 || segments[0] !== metadataFieldPrefix) {
    return undefined;
  }

  const namespace = segments[1];
  const key = segments[2];

  if (!isSafeMetadataSegment(namespace) || !isSafeMetadataSegment(key)) {
    return undefined;
  }

  return {
    namespace,
    key,
  };
}

function isSafeMetadataSegment(value: string | undefined): value is string {
  return (
    value !== undefined &&
    !unsafeFieldSegments.has(value) &&
    metadataFieldSegmentPattern.test(value)
  );
}

function resolveMetadataField(
  pageId: string,
  metadata: readonly MetadataRecord[],
  field: MetadataField,
): FieldValue | undefined {
  const record = metadata.find(
    (candidate) =>
      candidate.pageId === pageId &&
      candidate.namespace === field.namespace &&
      candidate.key === field.key &&
      candidate.sourcePluginId === field.namespace,
  );

  if (record === undefined) {
    return undefined;
  }

  return {
    value: record.value,
    valueType: record.valueType,
  };
}

function resolveComparableValue(
  value: unknown,
  currentDate: string,
): ComparableValue {
  if (isRelativeTodayValue(value)) {
    if (!isDateOnlyString(currentDate)) {
      return { comparable: false };
    }

    return {
      comparable: true,
      value: currentDate,
      requiresDateMetadata: true,
    };
  }

  return {
    comparable: true,
    value,
    requiresDateMetadata: false,
  };
}

function valuesEqual(
  fieldValue: FieldValue,
  expected: Extract<ComparableValue, { comparable: true }>,
): boolean {
  if (expected.requiresDateMetadata && !isDateMetadataValue(fieldValue)) {
    return false;
  }

  return Object.is(fieldValue.value, expected.value);
}

function valueIncludes(
  fieldValue: FieldValue,
  expected: Extract<ComparableValue, { comparable: true }>,
): boolean {
  if (expected.requiresDateMetadata || !Array.isArray(fieldValue.value)) {
    return false;
  }

  return fieldValue.value.some((item) => Object.is(item, expected.value));
}

function isDateMetadataValue(fieldValue: FieldValue): boolean {
  return (
    fieldValue.valueType === "date" &&
    typeof fieldValue.value === "string" &&
    isDateOnlyString(fieldValue.value)
  );
}

function isRelativeTodayValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const kind = readStringDataProperty(value, "kind");
  const relativeValue = readStringDataProperty(value, "value");

  return kind === "relative-date" && relativeValue === "today";
}

function readDataArrayProperty(
  input: object,
  propertyName: string,
): unknown[] | undefined {
  const property = readDataProperty(input, propertyName);

  return property.present && Array.isArray(property.value)
    ? property.value
    : undefined;
}

function readStringDataProperty(
  input: object,
  propertyName: string,
): string | undefined {
  const property = readDataProperty(input, propertyName);

  return property.present && typeof property.value === "string"
    ? property.value
    : undefined;
}

function readDataProperty(
  input: object,
  propertyName: string,
): OptionalDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, propertyName);

    if (descriptor === undefined || !("value" in descriptor)) {
      return { present: false };
    }

    return {
      present: true,
      value: descriptor.value,
    };
  } catch {
    return { present: false };
  }
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateOnlyString(value: string): boolean {
  if (!dateOnlyPattern.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function createCurrentLocalDate(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
