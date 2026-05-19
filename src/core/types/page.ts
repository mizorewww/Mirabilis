export type BlockNode = {
  blockId: string;
  type?: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
  text?: string;
  marks?: unknown[];
};

export type StructuredMarkdownDocument = {
  type: "doc";
  content: BlockNode[];
};

export type MarkdownPage = {
  id: string;
  title: string;
  parentPageId?: string;
  body: StructuredMarkdownDocument;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
