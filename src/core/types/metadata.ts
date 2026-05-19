export type MetadataValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "date"
  | "null";

export type MetadataRecord = {
  id: string;
  pageId: string;
  namespace: string;
  key: string;
  value: unknown;
  valueType: MetadataValueType;
  sourcePluginId: string;
  createdAt: string;
  updatedAt: string;
};
