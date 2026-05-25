import type {
  AiProviderBoundaryRequest,
  OpenAiResponsesRequest,
} from "./modelProvider";

type OpenAiTransportRequest = Omit<AiProviderBoundaryRequest, "request"> & {
  request: Omit<OpenAiResponsesRequest, "input"> & {
    input: unknown;
  };
};

export type OpenAiProvider = {
  generate(request: OpenAiTransportRequest): Promise<unknown>;
  id: "openai";
};

export type OpenAiTransport = {
  generate(request: OpenAiTransportRequest): Promise<unknown>;
};

export function createOpenAIProvider(
  transport: OpenAiTransport | null = null,
): OpenAiProvider {
  return {
    async generate(request) {
      if (transport === null) {
        throw new Error("AI provider unavailable");
      }

      let rawResponse: unknown;

      try {
        rawResponse = await transport.generate(request);
      } catch {
        throw new Error("AI provider unavailable");
      }

      return parseOpenAiResponse(rawResponse);
    },
    id: "openai",
  };
}

function parseOpenAiResponse(response: unknown): unknown {
  const payload = readPlainRecord(response);

  if (readOptionalValue(payload, "error") !== undefined) {
    throw new Error("AI provider unavailable");
  }

  const status = readOptionalString(payload, "status");

  if (status !== undefined && status !== "completed") {
    throw new Error("AI provider output invalid");
  }

  const outputText = readOptionalString(payload, "output_text");

  if (outputText !== undefined) {
    return parseOpenAiOutputJson(outputText);
  }

  const output = readOptionalValue(payload, "output");

  if (output === undefined) {
    throw new Error("AI provider output invalid");
  }

  for (const item of readPlainArray(output)) {
    const contentText = readMessageContentText(item);

    if (contentText !== null) {
      return parseOpenAiOutputJson(contentText);
    }
  }

  throw new Error("AI provider output invalid");
}

function readMessageContentText(item: unknown): string | null {
  const message = readPlainRecord(item);
  const type = readOptionalString(message, "type");

  if (type !== "message") {
    return null;
  }

  const content = readOptionalValue(message, "content");

  if (content === undefined) {
    throw new Error("AI provider output invalid");
  }

  for (const entry of readPlainArray(content)) {
    const contentPart = readPlainRecord(entry);
    const contentType = readOptionalString(contentPart, "type");

    if (contentType === "refusal" || readOptionalString(contentPart, "refusal") !== undefined) {
      throw new Error("AI provider refused");
    }

    if (contentType === "output_text") {
      const text = readOptionalString(contentPart, "text");

      if (text !== undefined) {
        return text;
      }
    }
  }

  return null;
}

function parseOpenAiOutputJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("AI provider output invalid");
  }
}

function readPlainRecord(input: unknown): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error("AI provider output invalid");
  }

  return input as Record<string, unknown>;
}

function readPlainArray(input: unknown): unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype
  ) {
    throw new Error("AI provider output invalid");
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");

  if (
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    throw new Error("AI provider output invalid");
  }

  const values: unknown[] = [];

  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") {
      continue;
    }

    if (typeof key !== "string" || readArrayIndex(key, lengthDescriptor.value) === null) {
      throw new Error("AI provider output invalid");
    }
  }

  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("AI provider output invalid");
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

function readOptionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = readOptionalValue(input, key);

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("AI provider output invalid");
  }

  return value;
}

function readOptionalValue(
  input: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (descriptor === undefined) {
    return undefined;
  }

  if (
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")
  ) {
    throw new Error("AI provider output invalid");
  }

  return descriptor.value;
}
