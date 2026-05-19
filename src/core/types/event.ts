export type AppEvent = {
  id: string;
  pageId?: string;
  namespace: string;
  type: string;
  payload: unknown;
  sourcePluginId: string;
  createdAt: string;
};
