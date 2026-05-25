export type AiOperation =
  | "cleanup-inbox"
  | "turn-text-into-task"
  | "suggest-tags"
  | "suggest-due-date"
  | "generate-subtasks"
  | "generate-filter"
  | "summarize-time-notes"
  | "generate-weekly-review"
  | "explain-prediction";

export type OpenAiStructuredOutputFormat = {
  name: string;
  schema: Record<string, unknown>;
  strict: true;
  type: "json_schema";
};

export type OpenAiResponsesInputItem = {
  content?: string | readonly OpenAiResponsesInputContent[];
  input?: string | readonly OpenAiResponsesInputContent[];
  role?: string;
  type?: string;
};

export type OpenAiResponsesInputContent = {
  content?: string;
  text?: string;
  type?: string;
};

export type OpenAiResponsesRequest = {
  input: string | readonly OpenAiResponsesInputItem[];
  instructions: string;
  model: string;
  store: false;
  text: {
    format: OpenAiStructuredOutputFormat;
  };
};

export type AiProviderBoundaryRequest = {
  operation: AiOperation;
  providerId: "openai";
  request: OpenAiResponsesRequest;
};

export type AiModelProvider = {
  generate(request: AiProviderBoundaryRequest): Promise<unknown>;
  id: "openai";
};

export type AiCommandResult = Record<string, unknown>;
