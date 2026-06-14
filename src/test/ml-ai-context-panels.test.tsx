import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import App from "../App";
import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppEvent,
  type BlockNode,
  type CoreStores,
  type DbQuery,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type StructuredMarkdownDocument,
} from "../core";
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type CreateRuntimeOptions = {
  eventIds?: readonly string[];
  metadataIds?: readonly string[];
  pageIds?: readonly string[];
};

type SourceLine = {
  blockId: string;
  text: string;
};

type RuntimeSnapshot = {
  events: AppEvent[];
  filters: FilterDefinition[];
  metadata: MetadataRecord[];
  pages: MarkdownPage[];
};

type Deferred<Value> = {
  promise: Promise<Value>;
  reject(reason: unknown): void;
  resolve(value: Value): void;
};

type MlPredictionResult = ReturnType<typeof createPredictionResult>;

type ViewProps = Record<string, unknown> & {
  data?: unknown;
};

type SourceFile = {
  filePath: string;
  source: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const fixedNow = new Date("2026-06-01T14:00:00.000Z");
const homeTitle = "Home";
const mlPluginId = "ml";
const aiPluginId = "ai";
const mlRunPredictionCommandId = "ml.run-prediction";
const mlPredictionAlgorithmId = "ml.predict-remaining-time";
const mlPredictionInputKind = "ml.remaining-time-prediction-input";
const mlPredictionResultKind = "ml.remaining-time-prediction";
const mlBaselineModelId = "ml.remaining-time-baseline.v1";
const mlPredictionPanelViewId = "ml.prediction-panel";
const aiSuggestionPanelViewId = "ai.suggestion-panel";
const aiReviewPanelViewId = "ai.review-panel";
const allowedAiCommandIds = [
  "ai.suggest-tags",
  "ai.suggest-due-date",
  "ai.generate-subtasks",
  "ai.explain-prediction",
] as const;
const forbiddenAiShellCommandLabels = [
  /weekly review/i,
  /generate filter/i,
  /cleanup inbox/i,
  /turn text into task/i,
  /\bapply\b/i,
  /\bsave\b/i,
  /\baccept\b/i,
] as const;
const appShellEntrypoints = [
  "src/App.tsx",
  "src/main.tsx",
  "src/shell",
  "src/providers",
] as const;
const task043SurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/gen/schemas",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/db",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
  "CHANGELOG.md",
] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(fixedNow);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TASK-043 ML and AI context panel shell", () => {
  it("opens and closes a right complementary current-page panel without replacing the Markdown editor, then returns focus", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [
      { blockId: "home-body", text: "Current Home body" },
    ]);
    renderReadyApp(runtime);

    const main = await screen.findByRole("main", { name: /home/i });
    const editor = await within(main).findByRole("textbox", { name: /markdown/i });
    const toggle = await screen.findByRole("button", { name: /context panel/i });

    await user.click(editor);
    await user.type(editor, "\nStill editable while the panel opens");
    await user.click(toggle);

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(panel).toBeVisible();
    expect(
      (within(main).getByRole("textbox", {
        name: /markdown/i,
      }) as HTMLTextAreaElement).value,
    ).toContain(
      "Still editable",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAccessibleName(/page context/i);

    const close = within(panel).getByRole("button", {
      name: /close context panel/i,
    });

    await user.click(close);

    expect(
      screen.queryByRole("complementary", { name: /page context/i }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(within(main).getByRole("textbox", { name: /markdown/i })).toBeVisible();
  });

  it("gates the context panel to page routes and does not create Drawer routes for ML or AI", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, []);
    renderReadyApp(runtime);

    const workspaceRoutes = within(
      await screen.findByRole("navigation", { name: /^Workspace$/i }),
    ).getByRole("list", { name: /^Workspace routes$/i });

    expect(
      within(workspaceRoutes).queryByRole("button", { name: /\bML\b/i }),
    ).not.toBeInTheDocument();
    expect(
      within(workspaceRoutes).queryByRole("button", { name: /\bAI\b/i }),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    expect(
      await screen.findByRole("complementary", { name: /page context/i }),
    ).toBeVisible();

    await user.click(await findWorkspaceRouteButton(/^Today\b/i));

    expect(
      screen.queryByRole("complementary", { name: /page context/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /context panel/i }),
    ).not.toBeInTheDocument();
  });

  it("switches between accessible ML, AI suggestions, and AI review tabpanels rendered through exact ViewHost ids", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const mlProps: ViewProps[] = [];
    const suggestionProps: ViewProps[] = [];
    const reviewProps: ViewProps[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [{ blockId: "home", text: "Home" }]);
    replaceMlPredictionView(runtime, mlProps);
    replaceAiSuggestionView(runtime, suggestionProps);
    replaceAiReviewView(runtime, reviewProps);
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(within(panel).getByRole("tab", { name: /^ML$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await within(panel).findByRole("tabpanel", { name: /ML/i }),
    ).toBeVisible();

    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));

    expect(
      await within(panel).findByRole("tabpanel", { name: /suggestions/i }),
    ).toBeVisible();
    expect(await within(panel).findByRole("region", { name: /AI suggestion host/i }))
      .toBeVisible();
    expect(suggestionProps[suggestionProps.length - 1]?.data).toStrictEqual({
      kind: aiSuggestionPanelViewId,
    });

    await user.click(within(panel).getByRole("tab", { name: /review/i }));

    expect(
      await within(panel).findByRole("tabpanel", { name: /review/i }),
    ).toBeVisible();
    expect(await within(panel).findByRole("region", { name: /AI review host/i }))
      .toBeVisible();
    expect(reviewProps[reviewProps.length - 1]?.data).toStrictEqual({
      kind: aiReviewPanelViewId,
    });
    expect(mlProps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "page.sidebar.panel" }),
      ]),
    );
  });

  it("keeps every Page context tab aria-controls target mounted", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [{ blockId: "home", text: "Home" }]);
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });
    const controlledPanelIds = within(panel)
      .getAllByRole("tab")
      .map((tab) => tab.getAttribute("aria-controls"));

    expect(controlledPanelIds).toStrictEqual([
      "page-context-ml-panel",
      "page-context-suggestions-panel",
      "page-context-review-panel",
    ]);

    for (const controlledPanelId of controlledPanelIds) {
      expect(controlledPanelId).toEqual(expect.any(String));
      expect(document.getElementById(controlledPanelId ?? "")).toBeInstanceOf(
        HTMLElement,
      );
    }
  });

  it("runs ML prediction through Command Registry with an exact current-page payload and renders ml.prediction-panel", async () => {
    const runtime = await createRuntime({
      eventIds: ["event-current-timer", "event-foreign-timer"],
      metadataIds: ["metadata-estimate", "metadata-secret"],
      pageIds: ["home-page", "foreign-page"],
    });
    const mlProps: ViewProps[] = [];
    const mlHandler = vi.fn(async (payload: unknown) => {
      void payload;

      return createPredictionResult("home-page", homeTitle);
    });
    const execute = vi.spyOn(runtime.commands, "execute");
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-private", text: "HOME_BODY_ALLOWED_FOR_AI_ONLY" },
    ]);
    const foreign = createRuntimePage(runtime, "Foreign Private Page", [
      { blockId: "foreign-private", text: "FOREIGN_BODY_MUST_NOT_LEAK" },
    ]);

    appendTimerSegment(runtime, home, "segment-current");
    appendTimerSegment(runtime, foreign, "segment-foreign");
    runtime.metadata.set({
      key: "estimateSeconds",
      namespace: "task",
      pageId: home.id,
      sourcePluginId: "task",
      value: 3_600,
      valueType: "number",
    });
    runtime.metadata.set({
      key: "apiKey",
      namespace: "ai",
      pageId: home.id,
      sourcePluginId: "ai",
      value: "sk-test-secret",
      valueType: "string",
    });
    replaceMlRunPredictionCommand(runtime, mlHandler);
    replaceMlPredictionView(runtime, mlProps);
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));
    await user.click(await screen.findByRole("button", { name: /run prediction/i }));

    const predictionPanel = await screen.findByRole("region", {
      name: /ML prediction host/i,
    });

    expect(predictionPanel).toHaveTextContent(homeTitle);
    expect(execute).toHaveBeenCalledWith(
      mlRunPredictionCommandId,
      expect.objectContaining({
        algorithmId: mlPredictionAlgorithmId,
        input: expect.objectContaining({
          generatedAt: fixedNow.toISOString(),
          kind: mlPredictionInputKind,
          pageId: home.id,
        }),
      }),
    );
    expect(mlHandler).toHaveBeenCalledTimes(1);
    expect(mlHandler.mock.calls[0]?.[0]).toStrictEqual({
      algorithmId: mlPredictionAlgorithmId,
      input: {
        events: [
          expect.objectContaining({
            pageId: home.id,
            type: "time_segment_created",
          }),
        ],
        generatedAt: fixedNow.toISOString(),
        kind: mlPredictionInputKind,
        metadata: [
          {
            key: "estimateSeconds",
            namespace: "task",
            pageId: home.id,
            sourcePluginId: "task",
            value: 3_600,
            valueType: "number",
          },
        ],
        pageId: home.id,
        pages: [
          {
            id: home.id,
            title: home.title,
          },
        ],
      },
    });
    expect(mlProps[mlProps.length - 1]?.data).toEqual(
      expect.objectContaining({
        kind: mlPredictionResultKind,
        pageId: home.id,
      }),
    );
    expectNoVisibleLeak([
      "FOREIGN_BODY_MUST_NOT_LEAK",
      "segment-foreign",
      "metadata-secret",
      "sk-test-secret",
    ]);
  });

  it("executes only allowed advisory AI commands, reports success and redacted errors, and does not mutate runtime data", async () => {
    const runtime = await createRuntime({
      metadataIds: ["metadata-tag"],
      pageIds: ["home-page"],
    });
    const capturedAiPayloads = new Map<string, unknown[]>();
    const execute = vi.spyOn(runtime.commands, "execute");
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-ai", text: "Suggest only from this current page." },
    ]);

    runtime.metadata.set({
      key: "tags",
      namespace: "tag",
      pageId: home.id,
      sourcePluginId: "tag",
      value: ["context"],
      valueType: "json",
    });
    for (const commandId of allowedAiCommandIds) {
      replaceAiCommand(runtime, commandId, async (payload) => {
        capturedAiPayloads.set(commandId, [
          ...(capturedAiPayloads.get(commandId) ?? []),
          payload,
        ]);

        if (commandId === "ai.generate-subtasks") {
          throw createSensitivePanelError();
        }

        return createAiResult(commandId);
      });
    }
    const snapshotBefore = snapshotRuntimeState(runtime);

    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));
    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));

    for (const label of forbiddenAiShellCommandLabels) {
      expect(within(panel).queryByRole("button", { name: label })).not.toBeInTheDocument();
    }

    await user.click(within(panel).getByRole("button", { name: /^Suggest tags$/i }));
    await user.click(
      within(panel).getByRole("button", { name: /^Suggest due date$/i }),
    );
    await user.click(
      within(panel).getByRole("button", { name: /^Generate subtasks$/i }),
    );

    expect(await within(panel).findByText(/suggested tags/i)).toBeVisible();
    expect(await within(panel).findByText(/2026-06-02/i)).toBeVisible();
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      /AI suggestion unavailable|could not generate/i,
    );
    expectNoVisibleLeak([
      "sk-test-secret",
      "OPENAI_SECRET",
      "providerSettings",
      "/home/aac6fef",
      "NativeBridge",
      "PluginHost",
    ]);
    const suggestTagsPayloads = capturedAiPayloads.get("ai.suggest-tags") ?? [];
    const suggestDueDatePayloads =
      capturedAiPayloads.get("ai.suggest-due-date") ?? [];
    const generateSubtasksPayloads =
      capturedAiPayloads.get("ai.generate-subtasks") ?? [];
    const expectedPagePayload = {
      bodyMarkdown: "Suggest only from this current page.",
      id: home.id,
      title: home.title,
    };
    const expectedSuggestTagsPayload = {
      existingTags: ["context"],
      kind: "ai.suggest-tags-input",
      page: expectedPagePayload,
    };
    const expectedSuggestDueDatePayload = {
      kind: "ai.suggest-due-date-input",
      metadata: [
        {
          key: "tags",
          namespace: "tag",
          pageId: home.id,
          sourcePluginId: "tag",
          value: ["context"],
          valueType: "json",
        },
      ],
      now: fixedNow.toISOString(),
      page: expectedPagePayload,
    };
    const expectedGenerateSubtasksPayload = {
      existingChildren: [],
      kind: "ai.generate-subtasks-input",
      page: expectedPagePayload,
    };

    expect(suggestTagsPayloads[suggestTagsPayloads.length - 1]).toStrictEqual(
      expectedSuggestTagsPayload,
    );
    expect(
      suggestDueDatePayloads[suggestDueDatePayloads.length - 1],
    ).toStrictEqual(expectedSuggestDueDatePayload);
    expect(
      generateSubtasksPayloads[generateSubtasksPayloads.length - 1],
    ).toStrictEqual(expectedGenerateSubtasksPayload);
    expect(execute).toHaveBeenCalledWith(
      "ai.suggest-tags",
      expectedSuggestTagsPayload,
    );
    expect(execute).toHaveBeenCalledWith(
      "ai.suggest-due-date",
      expectedSuggestDueDatePayload,
    );
    expect(execute).toHaveBeenCalledWith(
      "ai.generate-subtasks",
      expectedGenerateSubtasksPayload,
    );
    expect(
      execute.mock.calls.some(
        ([commandId]) => commandId === "ai.explain-prediction",
      ),
    ).toBe(false);
    expect(capturedAiPayloads.has("ai.explain-prediction")).toBe(false);
    expect(snapshotRuntimeState(runtime)).toStrictEqual(snapshotBefore);
  });

  it("renders real AI failure DTOs as unavailable instead of successful suggestions", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [
      { blockId: "home-ai-failure", text: "Current page only." },
    ]);
    replaceAiCommand(runtime, "ai.suggest-tags", async () => ({
      kind: "ai.provider-unconfigured",
    }));
    replaceAiCommand(runtime, "ai.suggest-due-date", async () => ({
      kind: "ai.provider-unavailable",
    }));
    replaceAiCommand(runtime, "ai.generate-subtasks", async () => ({
      kind: "ai.provider-output-invalid",
    }));
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));
    await user.click(within(panel).getByRole("button", { name: /^Suggest tags$/i }));
    await user.click(
      within(panel).getByRole("button", { name: /^Suggest due date$/i }),
    );
    await user.click(
      within(panel).getByRole("button", { name: /^Generate subtasks$/i }),
    );

    const alerts = await within(panel).findAllByRole("alert");

    expect(alerts).toHaveLength(3);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent(/AI suggestion unavailable|could not generate/i);
    }
    expect(within(panel).queryByText(/AI suggestion ready/i)).not.toBeInTheDocument();
    expectNoVisibleLeakWithin(panel, [
      "providerSettings",
      "apiKey",
      "OPENAI_SECRET",
      "/home/aac6fef",
    ]);
  });

  it("enables explain-prediction only after a current-page ML prediction succeeds", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const capturedExplainPayloads: unknown[] = [];
    const execute = vi.spyOn(runtime.commands, "execute");
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-explain", text: "Explain this prediction." },
    ]);

    replaceMlRunPredictionCommand(runtime, async () =>
      createPredictionResult(home.id, home.title),
    );
    replaceMlPredictionView(runtime, []);
    replaceAiCommand(runtime, "ai.explain-prediction", async (payload) => {
      capturedExplainPayloads.push(payload);

      return {
        explanation: "Prediction explanation generated.",
        kind: "ai.prediction-explanation",
        limitations: ["Advisory only."],
      };
    });
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));
    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));

    expect(
      within(panel).queryByRole("button", { name: /^Explain prediction$/i }),
    ).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("tab", { name: /^ML$/i }));
    await user.click(await within(panel).findByRole("button", { name: /run prediction/i }));
    expect(
      await within(panel).findByRole("region", { name: /ML prediction host/i }),
    ).toBeVisible();

    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));
    await user.click(
      await within(panel).findByRole("button", { name: /^Explain prediction$/i }),
    );

    expect(await within(panel).findByText(/Prediction explanation generated/i))
      .toBeVisible();
    expect(capturedExplainPayloads).toStrictEqual([
      {
        kind: "ai.explain-prediction-input",
        page: {
          bodyMarkdown: "Explain this prediction.",
          id: home.id,
          title: home.title,
        },
        prediction: createPredictionResult(home.id, home.title),
      },
    ]);
    expect(execute).toHaveBeenCalledWith(
      "ai.explain-prediction",
      capturedExplainPayloads[0],
    );
  });

  it("omits explain-prediction when the ML result carries provider or secret-shaped fields", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const capturedExplainPayloads: unknown[] = [];
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-explain-secret", text: "Do not forward secrets." },
    ]);
    const unsafePrediction = {
      ...createPredictionResult(home.id, home.title),
      apiKey: "sk-unsafe-prediction-secret",
      providerSettings: {
        providerId: "openai",
      },
      rawErrorPath: "/home/aac6fef/private/provider.log",
    };

    replaceMlRunPredictionCommand(runtime, async () => unsafePrediction);
    replaceMlPredictionView(runtime, []);
    replaceAiCommand(runtime, "ai.explain-prediction", async (payload) => {
      capturedExplainPayloads.push(payload);

      return {
        explanation: "Should not be reachable.",
        kind: "ai.prediction-explanation",
        limitations: [],
      };
    });
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    await user.click(await within(panel).findByRole("button", { name: /run prediction/i }));
    await user.click(within(panel).getByRole("tab", { name: /suggestions/i }));

    expect(
      within(panel).queryByRole("button", { name: /^Explain prediction$/i }),
    ).not.toBeInTheDocument();
    expect(capturedExplainPayloads).toStrictEqual([]);
    expectNoVisibleLeakWithin(panel, [
      "sk-unsafe-prediction-secret",
      "providerSettings",
      "openai",
      "/home/aac6fef/private/provider.log",
      "rawErrorPath",
    ]);
  });

  it("refreshes on page switch and ignores stale prediction resolves or rejects from the previous page", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "second-page"],
    });
    const stalePrediction = createDeferred<MlPredictionResult>();
    const currentPrediction = createDeferred<MlPredictionResult>();
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    const home = createRuntimePage(runtime, homeTitle, [
      { blockId: "home-stale", text: "Home stale source" },
    ]);
    const second = createRuntimePage(runtime, "Second Page", [
      { blockId: "second-current", text: "Second current source" },
    ]);

    replaceMlRunPredictionCommand(runtime, (payload) => {
      const pageId = readPayloadPageId(payload);

      return pageId === home.id
        ? stalePrediction.promise
        : currentPrediction.promise;
    });
    replaceMlPredictionView(runtime, []);
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));
    await user.click(await screen.findByRole("button", { name: /run prediction/i }));
    await user.click(await findWorkspaceRouteButton(/^Second Page\b/i));

    await act(async () => {
      stalePrediction.resolve(createPredictionResult(home.id, "STALE HOME RESULT"));
      await stalePrediction.promise;
      await Promise.resolve();
    });

    expect(screen.queryByText("STALE HOME RESULT")).not.toBeInTheDocument();

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(panel).toHaveTextContent(/Second Page/i);

    await user.click(await within(panel).findByRole("button", { name: /run prediction/i }));

    await act(async () => {
      stalePrediction.reject(createSensitivePanelError());
      currentPrediction.resolve(createPredictionResult(second.id, second.title));
      await currentPrediction.promise;
      await Promise.resolve();
    });

    expect(panel).toHaveTextContent("Second Page");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectNoVisibleLeak(["Home stale source", "OPENAI_SECRET", "/home/aac6fef"]);
  });

  it("ignores stale AI advisory resolves and rejects after switching pages", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page", "second-page"],
    });
    const staleTags = createDeferred<Record<string, unknown>>();
    const staleDueDate = createDeferred<Record<string, unknown>>();
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [
      { blockId: "home-ai-stale", text: "HOME_AI_STALE_SOURCE" },
    ]);
    createRuntimePage(runtime, "Second Page", [
      { blockId: "second-ai-current", text: "Second page current source" },
    ]);
    replaceAiCommand(runtime, "ai.suggest-tags", async (payload) => {
      const pageId = readAiPayloadPageId(payload);

      return pageId === "home-page"
        ? staleTags.promise
        : createAiResult("ai.suggest-tags");
    });
    replaceAiCommand(runtime, "ai.suggest-due-date", async (payload) => {
      const pageId = readAiPayloadPageId(payload);

      return pageId === "home-page"
        ? staleDueDate.promise
        : createAiResult("ai.suggest-due-date");
    });
    const snapshotBefore = snapshotRuntimeState(runtime);

    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const homePanel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    await user.click(within(homePanel).getByRole("tab", { name: /suggestions/i }));
    await user.click(
      within(homePanel).getByRole("button", { name: /^Suggest tags$/i }),
    );
    await user.click(
      within(homePanel).getByRole("button", { name: /^Suggest due date$/i }),
    );
    await user.click(await findWorkspaceRouteButton(/^Second Page\b/i));

    await act(async () => {
      staleTags.resolve({
        kind: "ai.suggested-tags",
        tags: ["STALE_HOME_AI_TAG"],
      });
      staleDueDate.reject(createSensitivePanelError());
      await Promise.allSettled([staleTags.promise, staleDueDate.promise]);
      await Promise.resolve();
    });

    const currentPanel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(currentPanel).toHaveTextContent(/Second Page/i);
    expect(screen.queryByText(/STALE_HOME_AI_TAG/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(snapshotRuntimeState(runtime)).toStrictEqual(snapshotBefore);
    expectNoVisibleLeak([
      "HOME_AI_STALE_SOURCE",
      "OPENAI_SECRET",
      "providerSettings",
      "apiKey=sk-test-secret",
      "/home/aac6fef",
    ]);
  });

  it("fails closed for unavailable or malformed ML/AI surfaces without exposing raw errors, secrets, or provider settings UI", async () => {
    const runtime = await createRuntime({
      pageIds: ["home-page"],
    });
    const user = userEvent.setup({
      advanceTimers: (delay) => vi.advanceTimersByTime(delay),
    });

    createRuntimePage(runtime, homeTitle, [
      { blockId: "home-secret", text: "PRIVATE_BODY_TOKEN" },
    ]);
    runtime.registries.views.unregister(mlPredictionPanelViewId);
    runtime.registries.views.unregister(aiSuggestionPanelViewId);
    runtime.commands.unregister(mlRunPredictionCommandId);
    replaceAiCommand(runtime, "ai.suggest-tags", async () => {
      throw createSensitivePanelError();
    });
    renderReadyApp(runtime);

    await user.click(await screen.findByRole("button", { name: /context panel/i }));

    const panel = await screen.findByRole("complementary", {
      name: /page context/i,
    });

    expect(await within(panel).findByText(/unavailable|could not load|missing/i))
      .toBeVisible();
    expect(
      within(panel).queryByRole("button", { name: /provider settings|api key|openai/i }),
    ).not.toBeInTheDocument();
    expectNoVisibleLeakWithin(panel, [
      "PRIVATE_BODY_TOKEN",
      "OPENAI_SECRET",
      "providerSettings",
      "apiKey",
      "/home/aac6fef",
      "NativeBridge",
      "PluginHost",
      "CommandRegistryError",
    ]);
  });
});

describe("TASK-043 static shell boundaries", () => {
  it("does not change package, lockfile, Tauri, Rust, IPC, schema, capability, permission, or release surfaces", async () => {
    const changedSurfaceFiles = await listTask043SurfaceChangesFromMaster();

    expect(
      await disallowedNativeSurfaceChanges(changedSurfaceFiles),
    ).toStrictEqual([]);
  });

  it("keeps TASK-043 shell code free of live provider, network, worker, storage, secret, and settings surfaces", async () => {
    const violations: string[] = [];
    const files = await readAppShellProductionSources();

    for (const sourceFile of files) {
      violations.push(...findForbiddenTask043RuntimeSurfacePatterns(sourceFile));
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps app-shell and projection code out of private ML/AI plugin implementations and broad page.sidebar.panel mounting", async () => {
    const violations: string[] = [];
    const files = await readAppShellProductionSources();

    for (const sourceFile of files) {
      for (const moduleSpecifier of collectStaticModuleSpecifiers(
        sourceFile.source,
      )) {
        const resolvedModule = resolveModuleSpecifier(
          path.join(repoRoot, sourceFile.filePath),
          moduleSpecifier,
        );

        if (
          resolvedModule !== undefined &&
          /^src\/plugins\/(?:ml|ai)\//u.test(resolvedModule) &&
          !/^src\/plugins\/(?:ml|ai)\/index\.tsx?$/u.test(resolvedModule)
        ) {
          violations.push(
            `${sourceFile.filePath} -> ${moduleSpecifier}: private ML/AI plugin import`,
          );
        }
      }

      if (
        isAppShellOrProjectionPath(sourceFile.filePath) &&
        sourceFile.source.includes("page.sidebar.panel")
      ) {
        violations.push(
          `${sourceFile.filePath}: broad page.sidebar.panel mounting is deferred`,
        );
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("backs the context panel with explicit right-side non-overlay layout CSS", async () => {
    const appCss = await readFile(path.join(repoRoot, "src/App.css"), "utf8");
    const frameRule = extractCssRule(appCss, ".app-shell__frame");
    const panelRule = extractCssRule(appCss, ".app-shell__context-panel");

    expect(frameRule).toMatch(/\bdisplay\s*:\s*flex\b/u);
    expect(panelRule).toMatch(/\bflex\s*:\s*0\s+0\b|\bflex-basis\s*:/u);
    expect(panelRule).toMatch(/\bwidth\s*:|\bmin-width\s*:|\bmax-width\s*:/u);
    expect(panelRule).not.toMatch(/\bposition\s*:\s*(?:absolute|fixed)\b/u);
  });
});

function renderReadyApp(runtime: AppRuntime): void {
  render(<App initializeRuntime={vi.fn(async () => runtime)} />);
}

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createMetadataId =
    options.metadataIds === undefined
      ? undefined
      : createSequenceFactory(options.metadataIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined &&
    createMetadataId === undefined &&
    createEventId === undefined
      ? {}
      : {
          createStores: (): CoreStores =>
            createCoreStores({
              ...(createPageId === undefined
                ? {}
                : {
                    pages: {
                      createId: createPageId,
                    },
                  }),
              ...(createMetadataId === undefined
                ? {}
                : {
                    metadata: {
                      createId: createMetadataId,
                    },
                  }),
              ...(createEventId === undefined
                ? {}
                : {
                    events: {
                      createId: createEventId,
                    },
                  }),
            }),
        }),
  });
}

function createRuntimePage(
  runtime: AppRuntime,
  title: string,
  lines: readonly SourceLine[],
): MarkdownPage {
  return runtime.pages.create({
    body: structuredDocument(lines),
    title,
  });
}

function structuredDocument(lines: readonly SourceLine[]): StructuredMarkdownDocument {
  return {
    content: lines.map(
      (line): BlockNode => ({
        blockId: line.blockId,
        text: line.text,
        type: "markdown.line",
      }),
    ),
    type: "doc",
  };
}

function appendTimerSegment(
  runtime: AppRuntime,
  page: MarkdownPage,
  segmentId: string,
): AppEvent {
  return runtime.events.append({
    namespace: "timer",
    pageId: page.id,
    payload: {
      durationSeconds: 1_800,
      endAt: "2026-06-01T08:30:00.000Z",
      pageId: page.id,
      segmentId,
      source: "timer",
      startAt: "2026-06-01T08:00:00.000Z",
    },
    sourcePluginId: "timer",
    type: "time_segment_created",
  });
}

function replaceMlRunPredictionCommand(
  runtime: AppRuntime,
  handler: (payload: unknown) => unknown | Promise<unknown>,
  pluginId = mlPluginId,
): void {
  runtime.commands.unregister(mlRunPredictionCommandId);
  runtime.commands.register({
    handler,
    id: mlRunPredictionCommandId,
    pluginId,
    title: "Run prediction",
  });
}

function replaceAiCommand(
  runtime: AppRuntime,
  commandId: (typeof allowedAiCommandIds)[number],
  handler: (payload: unknown) => unknown | Promise<unknown>,
  pluginId = aiPluginId,
): void {
  try {
    runtime.commands.unregister(commandId);
  } catch {
    // Some focused tests replace only a subset of the AI command surface.
  }

  runtime.commands.register({
    handler,
    id: commandId,
    pluginId,
    title: commandId.replace(/^ai\./u, ""),
  });
}

function replaceMlPredictionView(
  runtime: AppRuntime,
  capturedProps: ViewProps[],
  pluginId = mlPluginId,
): void {
  runtime.registries.views.unregister(mlPredictionPanelViewId);
  runtime.registries.views.register({
    accepts: { kind: mlPredictionResultKind },
    component: (props: ViewProps) => {
      capturedProps.push(props);
      const data = isRecord(props.data) ? props.data : {};

      return (
        <section aria-label="ML prediction host" role="region">
          <p>{typeof data.pageTitle === "string" ? data.pageTitle : "No prediction"}</p>
        </section>
      );
    },
    id: mlPredictionPanelViewId,
    pluginId,
    title: "Prediction panel",
    type: mlPredictionPanelViewId,
  });
}

function replaceAiSuggestionView(
  runtime: AppRuntime,
  capturedProps: ViewProps[],
): void {
  runtime.registries.views.unregister(aiSuggestionPanelViewId);
  runtime.registries.views.register({
    accepts: { kind: aiSuggestionPanelViewId },
    component: (props: ViewProps) => {
      capturedProps.push(props);

      return (
        <section aria-label="AI suggestion host" role="region">
          AI suggestions ready
        </section>
      );
    },
    id: aiSuggestionPanelViewId,
    pluginId: aiPluginId,
    title: "AI suggestion panel",
    type: aiSuggestionPanelViewId,
  });
}

function replaceAiReviewView(
  runtime: AppRuntime,
  capturedProps: ViewProps[],
): void {
  runtime.registries.views.unregister(aiReviewPanelViewId);
  runtime.registries.views.register({
    accepts: { kind: aiReviewPanelViewId },
    component: (props: ViewProps) => {
      capturedProps.push(props);

      return (
        <section aria-label="AI review host" role="region">
          AI review ready
        </section>
      );
    },
    id: aiReviewPanelViewId,
    pluginId: aiPluginId,
    title: "AI review panel",
    type: aiReviewPanelViewId,
  });
}

function createPredictionResult(pageId: string, pageTitle: string) {
  return {
    algorithmId: mlPredictionAlgorithmId,
    confidence: 0.7,
    features: {
      baselineTotalSeconds: 3_600,
      childTasksCompleted: 0,
      childTasksTotal: 0,
      similarAverageSeconds: null,
      similarCompletedTasks: 0,
      tagIds: [],
      timerNoteCount: 0,
      trackedSeconds: 1_800,
    },
    generatedAt: fixedNow.toISOString(),
    kind: mlPredictionResultKind,
    limitations: ["Baseline heuristic only; no trained model is used."],
    maxSeconds: 7_200,
    minSeconds: 3_600,
    modelId: mlBaselineModelId,
    pageId,
    pageTitle,
    reasons: ["Trusted current-page timer evidence exists."],
  };
}

function createAiResult(commandId: string): Record<string, unknown> {
  switch (commandId) {
    case "ai.suggest-tags":
      return {
        confidence: 0.8,
        kind: "ai.suggested-tags",
        tags: ["context"],
      };
    case "ai.suggest-due-date":
      return {
        confidence: 0.7,
        dueDate: "2026-06-02",
        kind: "ai.suggested-due-date",
        reason: "Current page asks for tomorrow.",
      };
    default:
      return {
        kind: "ai.subtask-suggestions",
        markdown: "- [ ] Keep shell advisory only",
        subtasks: ["Keep shell advisory only"],
      };
  }
}

async function findWorkspaceRouteButton(name: RegExp): Promise<HTMLElement> {
  const navigation = await screen.findByRole("navigation", {
    name: /^Workspace$/i,
  });

  return within(navigation).findByRole("button", { name });
}

function readPayloadPageId(payload: unknown): string {
  if (
    isRecord(payload) &&
    isRecord(payload.input) &&
    typeof payload.input.pageId === "string"
  ) {
    return payload.input.pageId;
  }

  throw new Error("Expected ML payload to include input.pageId");
}

function readAiPayloadPageId(payload: unknown): string {
  if (
    isRecord(payload) &&
    isRecord(payload.page) &&
    typeof payload.page.id === "string"
  ) {
    return payload.page.id;
  }

  throw new Error("Expected AI payload to include page.id");
}

function snapshotRuntimeState(runtime: AppRuntime): RuntimeSnapshot {
  return {
    events: runtime.events.list().map(cloneJsonCompatible),
    filters: runtime.filters.list().map(cloneJsonCompatible),
    metadata: runtime.metadata.list().map(cloneJsonCompatible),
    pages: runtime.pages.list({ includeArchived: true }).map((page) => ({
      ...cloneJsonCompatible(page),
      body: {
        ...page.body,
        content: page.body.content.map((block) => ({ ...block })),
      },
    })),
  };
}

function cloneJsonCompatible<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function createSensitivePanelError(): Error {
  const error = new Error(
    [
      "OPENAI_SECRET",
      "providerSettings",
      "apiKey=sk-test-secret",
      "/home/aac6fef/private/context.md",
      "NativeBridge PluginHost CommandRegistryError",
    ].join(" "),
  );

  error.stack = "Error: OPENAI_SECRET at /home/aac6fef/src/plugins/ai/private.ts:1";

  return error;
}

function expectNoVisibleLeak(forbiddenTexts: readonly string[]): void {
  const visibleText = document.body.textContent ?? "";

  for (const forbiddenText of forbiddenTexts) {
    expect(visibleText).not.toContain(forbiddenText);
  }
}

function expectNoVisibleLeakWithin(
  element: HTMLElement,
  forbiddenTexts: readonly string[],
): void {
  const visibleText = element.textContent ?? "";

  for (const forbiddenText of forbiddenTexts) {
    expect(visibleText).not.toContain(forbiddenText);
  }
}

function createDeferred<Value>(): Deferred<Value> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createSequenceFactory(values: readonly string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error("No test id remains");
    }

    index += 1;

    return value;
  };
}

function createNoopNativeBridge(): NativeBridge {
  return {
    db: {
      async execute<Response>(_query: DbQuery): Promise<Response> {
        void _query;

        return undefined as Response;
      },
      async transaction<Response>(
        _queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        void _queries;

        return [] as NativeBridgeTransactionResult<Response>;
      },
    },
    files: {
      async exportMarkdown(_pageId: string, _path: string) {
        void _pageId;
        void _path;

        return undefined;
      },
      async importMarkdown(_path: string) {
        void _path;

        return "";
      },
    },
    notifications: {
      async notify(_input) {
        void _input;

        return undefined;
      },
    },
    shortcuts: {
      async register(_shortcut: string, _commandId: string) {
        void _shortcut;
        void _commandId;

        return undefined;
      },
      async unregister(_shortcut: string) {
        void _shortcut;

        return undefined;
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listTask043SurfaceChangesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...task043SurfaceEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...task043SurfaceEntrypoints,
  ]);

  return [...new Set([...changedTrackedFiles, ...untrackedFiles])].sort();
}

async function readAppShellProductionSources(): Promise<SourceFile[]> {
  const files = await listChangedTask043AppShellSourceFilesFromMaster();

  return Promise.all(
    files.map(async (absolutePath) => ({
      filePath: toRepoRelativePath(absolutePath),
      source: await readFile(absolutePath, "utf8"),
    })),
  );
}

async function listChangedTask043AppShellSourceFilesFromMaster(): Promise<string[]> {
  const changedTrackedFiles = await runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...appShellEntrypoints,
  ]);
  const untrackedFiles = await runGitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...appShellEntrypoints,
  ]);
  const relativeFiles = [...new Set([...changedTrackedFiles, ...untrackedFiles])]
    .filter((filePath) => sourceExtensions.has(path.extname(filePath)))
    .filter((filePath) => !filePath.startsWith("src/test/"));

  return relativeFiles.map((relativePath) => path.join(repoRoot, relativePath));
}

function findForbiddenTask043RuntimeSurfacePatterns(sourceFile: SourceFile): string[] {
  const violations: string[] = [];
  const { filePath, source } = sourceFile;

  if (!isAppShellOrProjectionPath(filePath)) {
    return violations;
  }

  const forbiddenPatterns = [
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u, "network API"],
    [/\b(?:Worker|SharedWorker|ServiceWorker)\b/u, "worker API"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/u, "browser storage API"],
    [/\b(?:keychain|secret|apiKey|api_key|authorization|Bearer)\b/iu, "secret/provider field"],
    [/\bproviderSettings\b|provider-settings|provider settings/iu, "provider settings UI"],
    [/@tauri-apps\/plugin-(?:http|fs|shell|opener|sql)|@tauri-apps\/api/u, "Tauri/native import"],
    [/\bopenai\b|gpt-5\.5|Responses API/iu, "live provider implementation detail"],
  ] as const;

  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${filePath}: ${label}`);
    }
  }

  return violations;
}

function collectStaticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImportPattern =
    /import(?:\s+type)?(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/gu;
  const exportFromPattern =
    /export(?:\s+type)?(?:\s+[\s\S]*?\s+from)\s*["']([^"']+)["']/gu;

  for (const pattern of [staticImportPattern, exportFromPattern]) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];

      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

function resolveModuleSpecifier(
  importerAbsolutePath: string,
  moduleSpecifier: string,
): string | undefined {
  if (!moduleSpecifier.startsWith(".")) {
    return moduleSpecifier;
  }

  const importerDirectory = path.dirname(importerAbsolutePath);
  const candidate = path.resolve(importerDirectory, moduleSpecifier);
  const relative = toRepoRelativePath(candidate);

  if (path.extname(relative).length > 0) {
    return relative;
  }

  return relative.replace(/\/index$/u, "");
}

function isAppShellOrProjectionPath(filePath: string): boolean {
  return (
    filePath === "src/App.tsx" ||
    filePath.startsWith("src/shell/") ||
    filePath.startsWith("src/providers/")
  );
}

function extractCssRule(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "u")
    .exec(source);

  return match?.groups?.body ?? "";
}

function toRepoRelativePath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const stdout = await runGitOutput(args);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function runGitOutput(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
  });

  return stdout;
}
