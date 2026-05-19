export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "includes"
  | "exists"
  | "within";

export type FilterCondition = {
  field: string;
  op: FilterOperator;
  value?: unknown;
};

export type FilterQuery = {
  where: FilterCondition[];
  and?: FilterQuery[];
  or?: FilterQuery[];
};

export type FilterSort = {
  field: string;
  direction: "asc" | "desc";
};

export type FilterGroup = {
  field: string;
};

export type FilterDefinition = {
  id: string;
  name: string;
  query: FilterQuery;
  sort?: FilterSort[];
  group?: FilterGroup;
  viewType: string;
  sourcePluginId?: string;
  createdAt: string;
  updatedAt: string;
};
