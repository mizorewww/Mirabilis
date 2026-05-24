import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  createCoreStores,
  type AppEvent,
  type CoreStores,
  type DbQuery,
  type MarkdownPage,
  type NativeBridge,
  type SlotContribution,
} from "../core";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type CreateRuntimeOptions = {
  pageIds?: readonly string[];
  eventIds?: readonly string[];
};

type TimerCommandId =
  | "timer.start"
  | "timer.pause"
  | "timer.resume"
  | "timer.stop"
  | "timer.switch";

type TimerState = "running" | "paused" | "stopped";

type ExpectedTimerDto = {
  pageId: string;
  pageTitle?: string;
  status: TimerState;
  segmentId?: string;
  elapsedSeconds?: number;
};

type TimerDtoRecord = Record<string, unknown> & {
  elapsedSeconds: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startedAt: string;
  status: TimerState;
  stoppedAt?: string;
};

type TimerGlobalActiveBarProps = {
  commands: Pick<AppRuntime["commands"], "execute">;
};

const timerPluginId = "timer";
const timerCommandIds = [
  "timer.start",
  "timer.stop",
  "timer.pause",
  "timer.resume",
  "timer.switch",
] as const;
const timerGlobalFloatingSlot = "global.floating";
const timerGlobalActiveBarSlotId = "timer.global-active-bar";
const timerStartedAt = "2026-05-24T01:00:00.000Z";
const timerNamespace = "timer";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const execFileAsync = promisify(execFile);
const nativeSurfaceEntrypoints = [
  "package.json",
  "bun.lock",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/capabilities",
  "src-tauri/permissions",
  "src-tauri/src/commands",
  "src-tauri/src/lib.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
];

describe("Timer Plugin runtime commands and active timer UI", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers only the canonical TASK-024 Timer commands and the global active-bar slot", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map(
      (plugin) => plugin.manifest.id,
    );
    const registeredCommandIds = runtime.registries.commands
      .list({ pluginId: timerPluginId })
      .map((command) => command.id);
    const globalTimerSlots = runtime.registries.slots.list({
      pluginId: timerPluginId,
      slot: timerGlobalFloatingSlot,
    });

    expect.soft(builtInPluginIds).toContain(timerPluginId);
    expect([...registeredCommandIds].sort()).toStrictEqual(
      [...timerCommandIds].sort(),
    );
    expect(registeredCommandIds).not.toContain("timer.start_timer");
    expect(registeredCommandIds).not.toContain("timer.stop_timer");
    expect(globalTimerSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: timerGlobalActiveBarSlotId,
          pluginId: timerPluginId,
          slot: timerGlobalFloatingSlot,
        }),
      ]),
    );
  });

  it("starts a page-associated timer, appends timer.started, and returns a narrow activeTimer DTO", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: ["event-timer-started"],
    });
    const page = createPage(runtime, "Build Timer runtime");

    const result = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(result, {
      pageId: page.id,
      pageTitle: page.title,
      status: "running",
      elapsedSeconds: 0,
    });
    const events = expectTimerEvents(runtime, ["started"]);
    const startedPayload = expectEventPayload(events[0]);

    expect(events[0]).toMatchObject({
      id: "event-timer-started",
      pageId: page.id,
      namespace: timerNamespace,
      type: "started",
      sourcePluginId: timerPluginId,
      createdAt: timerStartedAt,
    });
    expect(startedPayload.segmentId).toBe(activeTimer.segmentId);
    expect(startedPayload.startedAt).toBe(timerStartedAt);
    expectNoUnsafeDtoSurface(result);
  });

  it("pauses, resumes, and stops with frozen elapsed time and no TASK-025 segment side effects", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: [
        "event-timer-started",
        "event-timer-paused",
        "event-timer-resumed",
        "event-timer-stopped",
      ],
    });
    const page = createPage(runtime, "Pause resume timer");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const startedTimer = expectResultActiveTimer(startResult, {
      pageId: page.id,
      status: "running",
      elapsedSeconds: 0,
    });

    vi.advanceTimersByTime(90_000);

    const pauseResult = await executeTimerCommand(runtime, "timer.pause", {});
    const pausedTimer = expectResultActiveTimer(pauseResult, {
      pageId: page.id,
      status: "paused",
      segmentId: startedTimer.segmentId,
      elapsedSeconds: 90,
    });

    vi.advanceTimersByTime(120_000);

    const resumeResult = await executeTimerCommand(runtime, "timer.resume", {});
    expectResultActiveTimer(resumeResult, {
      pageId: page.id,
      status: "running",
      segmentId: pausedTimer.segmentId,
      elapsedSeconds: 90,
    });

    vi.advanceTimersByTime(30_000);

    const stopResult = await executeTimerCommand(runtime, "timer.stop");
    const stoppedTimer = expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: startedTimer.segmentId,
      elapsedSeconds: 120,
    });
    const events = expectTimerEvents(runtime, [
      "started",
      "paused",
      "resumed",
      "stopped",
    ]);

    expect(readRecord(stopResult, "timer.stop result").activeTimer).toBeNull();
    expect(stoppedTimer.segmentId).toBe(startedTimer.segmentId);
    expect(events.map((event) => event.type)).not.toContain(
      "time_segment_created",
    );
    expect(runtime.pages.list()).toHaveLength(1);
    expect(runtime.metadata.list({ namespace: timerNamespace })).toStrictEqual(
      [],
    );
    expectNoUnsafeDtoSurface([pauseResult, resumeResult, stopResult]);
  });

  it("enforces lifecycle preconditions and allows stopping a paused active timer", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: [
        "event-timer-started",
        "event-timer-paused",
        "event-timer-stopped",
      ],
    });
    const page = createPage(runtime, "Paused stop timer");

    await expect(
      executeTimerCommand(runtime, "timer.pause"),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      executeTimerCommand(runtime, "timer.resume"),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      executeTimerCommand(runtime, "timer.stop"),
    ).rejects.toBeInstanceOf(Error);
    expect(listTimerEvents(runtime)).toStrictEqual([]);

    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(startResult, {
      pageId: page.id,
      status: "running",
    });

    await expect(
      executeTimerCommand(runtime, "timer.resume", {}),
    ).rejects.toBeInstanceOf(Error);
    expectTimerEvents(runtime, ["started"]);

    vi.advanceTimersByTime(25_000);

    const pauseResult = await executeTimerCommand(runtime, "timer.pause");
    expectResultActiveTimer(pauseResult, {
      pageId: page.id,
      status: "paused",
      segmentId: activeTimer.segmentId,
      elapsedSeconds: 25,
    });

    await expect(
      executeTimerCommand(runtime, "timer.pause", {}),
    ).rejects.toBeInstanceOf(Error);
    expectTimerEvents(runtime, ["started", "paused"]);

    vi.advanceTimersByTime(30_000);

    const stopResult = await executeTimerCommand(runtime, "timer.stop", {});
    expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: activeTimer.segmentId,
      elapsedSeconds: 25,
    });
    expectTimerEvents(runtime, ["started", "paused", "stopped"]);
  });

  it("switches by stopping the previous active timer then starting the next without a pause event", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page-a", "timer-page-b"],
      eventIds: [
        "event-first-started",
        "event-first-stopped",
        "event-second-started",
      ],
    });
    const firstPage = createPage(runtime, "First timer page");
    const secondPage = createPage(runtime, "Second timer page");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: firstPage.id,
    });
    const firstTimer = expectResultActiveTimer(startResult, {
      pageId: firstPage.id,
      status: "running",
    });

    vi.advanceTimersByTime(45_000);

    const switchResult = await executeTimerCommand(runtime, "timer.switch", {
      pageId: secondPage.id,
    });
    const switchRecord = readRecord(switchResult, "timer.switch result");
    const stoppedTimer = expectTimerDto(switchRecord.stoppedTimer, {
      pageId: firstPage.id,
      pageTitle: firstPage.title,
      status: "stopped",
      segmentId: firstTimer.segmentId,
      elapsedSeconds: 45,
    });
    const activeTimer = expectTimerDto(switchRecord.activeTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "running",
      elapsedSeconds: 0,
    });
    const events = expectTimerEvents(runtime, ["started", "stopped", "started"]);

    expect(stoppedTimer.segmentId).toBe(firstTimer.segmentId);
    expect(activeTimer.segmentId).not.toBe(firstTimer.segmentId);
    expect(events.map((event) => event.type)).not.toContain("paused");
    expect(events.map((event) => event.type)).not.toContain(
      "time_segment_created",
    );
    expect(runtime.pages.list()).toHaveLength(2);
    expect(runtime.metadata.list({ namespace: timerNamespace })).toStrictEqual(
      [],
    );
    expectNoUnsafeDtoSurface(switchResult);
  });

  it("rejects malformed, extra, and caller-owned payload fields without changing active state or appending events", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: ["event-timer-started", "event-timer-stopped"],
    });
    const page = createPage(runtime, "Payload validation timer");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(startResult, {
      pageId: page.id,
      status: "running",
    });
    const originalEvents = listTimerEvents(runtime);
    const invalidCalls: Array<{
      commandId: TimerCommandId;
      input?: unknown;
    }> = [
      { commandId: "timer.start" },
      { commandId: "timer.start", input: {} },
      { commandId: "timer.start", input: null },
      { commandId: "timer.start", input: { pageId: "" } },
      { commandId: "timer.start", input: { pageId: 42 } },
      { commandId: "timer.start", input: { pageId: "missing-page" } },
      {
        commandId: "timer.start",
        input: { pageId: page.id, segmentId: "caller-segment" },
      },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, sourcePluginId: timerPluginId },
      },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, namespace: "timer", type: "started" },
      },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, startedAt: "1999-01-01T00:00:00.000Z" },
      },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, stoppedAt: "1999-01-01T00:00:00.000Z" },
      },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, durationSeconds: 999 },
      },
      { commandId: "timer.switch", input: { pageId: page.id, mode: "manual" } },
      {
        commandId: "timer.switch",
        input: { pageId: page.id, ownerPluginId: "task" },
      },
      { commandId: "timer.pause", input: null },
      { commandId: "timer.pause", input: { pageId: page.id } },
      { commandId: "timer.pause", input: { segmentId: "caller-segment" } },
      { commandId: "timer.resume", input: null },
      { commandId: "timer.resume", input: { durationSeconds: 1 } },
      { commandId: "timer.stop", input: null },
      { commandId: "timer.stop", input: { sourcePluginId: timerPluginId } },
    ];

    for (const call of invalidCalls) {
      await expect(
        executeTimerCommand(runtime, call.commandId, call.input),
      ).rejects.toBeInstanceOf(Error);
      expect(listTimerEvents(runtime)).toStrictEqual(originalEvents);
    }

    const stopResult = await executeTimerCommand(runtime, "timer.stop");
    expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: activeTimer.segmentId,
    });
    expectTimerEvents(runtime, ["started", "stopped"]);
  });

  it("keeps active timer state scoped to one Timer Plugin registration and never leaks across runtimes", async () => {
    useFakeClock(timerStartedAt);
    const firstRuntime = await createRuntime({
      pageIds: ["first-runtime-page"],
      eventIds: ["first-started", "first-stopped"],
    });
    const secondRuntime = await createRuntime({
      pageIds: ["second-runtime-page"],
      eventIds: ["second-started", "second-stopped"],
    });
    const firstPage = createPage(firstRuntime, "First runtime timer");
    const secondPage = createPage(secondRuntime, "Second runtime timer");
    const firstStart = await executeTimerCommand(firstRuntime, "timer.start", {
      pageId: firstPage.id,
    });
    const firstTimer = expectResultActiveTimer(firstStart, {
      pageId: firstPage.id,
      status: "running",
    });

    await expect(
      executeTimerCommand(secondRuntime, "timer.stop"),
    ).rejects.toBeInstanceOf(Error);
    expect(listTimerEvents(secondRuntime)).toStrictEqual([]);

    const secondStart = await executeTimerCommand(secondRuntime, "timer.start", {
      pageId: secondPage.id,
    });
    const secondTimer = expectResultActiveTimer(secondStart, {
      pageId: secondPage.id,
      status: "running",
    });

    expect(secondTimer.segmentId).not.toBe(firstTimer.segmentId);

    const secondStop = await executeTimerCommand(secondRuntime, "timer.stop");
    expectStoppedTimerResult(secondStop, {
      pageId: secondPage.id,
      status: "stopped",
      segmentId: secondTimer.segmentId,
    });
    expectTimerEvents(secondRuntime, ["started", "stopped"]);

    const firstStop = await executeTimerCommand(firstRuntime, "timer.stop");
    expectStoppedTimerResult(firstStop, {
      pageId: firstPage.id,
      status: "stopped",
      segmentId: firstTimer.segmentId,
    });
    expectTimerEvents(firstRuntime, ["started", "stopped"]);
  });

  it("renders the Timer-owned global active bar with inert text, elapsed time, and lifecycle controls", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["unsafe-title-page"],
      eventIds: [
        "event-started",
        "event-paused",
        "event-resumed",
        "event-stopped",
      ],
    });
    const user = userEvent.setup({
      advanceTimers: (milliseconds) => vi.advanceTimersByTime(milliseconds),
    });
    const unsafeTitle =
      "Timer <script>alert(1)</script> [x](javascript:alert(1))";
    const page = createPage(runtime, unsafeTitle);
    const ActiveTimerBar = getTimerGlobalActiveBarComponent(runtime);

    await executeTimerCommand(runtime, "timer.start", { pageId: page.id });
    render(createElement(ActiveTimerBar, { commands: runtime.commands }));

    const activeTimer = screen.getByRole("region", { name: /active timer/i });

    expect(within(activeTimer).getByText(unsafeTitle)).toBeVisible();
    expect(within(activeTimer).getByText("00:00:00")).toBeVisible();
    expect(
      within(activeTimer).getByRole("button", { name: /pause/i }),
    ).toBeVisible();
    expect(
      within(activeTimer).getByRole("button", { name: /stop/i }),
    ).toBeVisible();
    expect(
      within(activeTimer).getByRole("button", { name: /switch/i }),
    ).toBeVisible();
    expectNoDangerousDom();

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(within(activeTimer).getByText("00:01:05")).toBeVisible();

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /resume/i }),
      ).toBeVisible(),
    );

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(within(activeTimer).getByText("00:01:05")).toBeVisible();

    await user.click(
      within(activeTimer).getByRole("button", { name: /resume/i }),
    );

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(within(activeTimer).getByText("00:01:20")).toBeVisible();

    await user.click(within(activeTimer).getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /active timer/i }),
      ).not.toBeInTheDocument(),
    );
    expectTimerEvents(runtime, ["started", "paused", "resumed", "stopped"]);
    expectNoDangerousDom();
  });

  it("does not require native, Tauri, package, Cargo, permission, IPC, or command-surface changes", async () => {
    expect(await listNativeSurfaceChangesFromMaster()).toStrictEqual([]);
  });
});

async function createRuntime(
  options: CreateRuntimeOptions = {},
): Promise<AppRuntime> {
  const createPageId =
    options.pageIds === undefined
      ? undefined
      : createSequenceFactory(options.pageIds);
  const createEventId =
    options.eventIds === undefined
      ? undefined
      : createSequenceFactory(options.eventIds);

  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
    ...(createPageId === undefined && createEventId === undefined
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

function createPage(runtime: AppRuntime, title: string): MarkdownPage {
  return runtime.pages.create({
    title,
    body: {
      type: "doc",
      content: [],
    },
  });
}

function executeTimerCommand(
  runtime: AppRuntime,
  commandId: TimerCommandId,
  input?: unknown,
): Promise<unknown> {
  return runtime.commands.execute(commandId, input);
}

function expectResultActiveTimer(
  result: unknown,
  expected: ExpectedTimerDto,
): TimerDtoRecord {
  const resultRecord = readRecord(result, "timer command result");

  return expectTimerDto(resultRecord.activeTimer, expected);
}

function expectStoppedTimerResult(
  result: unknown,
  expected: ExpectedTimerDto,
): TimerDtoRecord {
  const resultRecord = readRecord(result, "timer stop result");

  return expectTimerDto(resultRecord.stoppedTimer, expected);
}

function expectTimerDto(
  value: unknown,
  expected: ExpectedTimerDto,
): TimerDtoRecord {
  const timer = readRecord(value, "timer DTO");

  expect(Object.keys(timer).sort()).toStrictEqual([
    "elapsedSeconds",
    "pageId",
    "pageTitle",
    "segmentId",
    "startedAt",
    "status",
    ...(expected.status === "stopped" ? ["stoppedAt"] : []),
  ].sort());
  expect(timer.pageId).toBe(expected.pageId);
  expect(timer.status).toBe(expected.status);
  expect(timer.segmentId).toEqual(expect.any(String));
  expect(String(timer.segmentId)).not.toHaveLength(0);
  expect(timer.startedAt).toEqual(expect.any(String));
  expect(timer.elapsedSeconds).toEqual(expect.any(Number));

  if (expected.pageTitle !== undefined) {
    expect(timer.pageTitle).toBe(expected.pageTitle);
  }

  if (expected.segmentId !== undefined) {
    expect(timer.segmentId).toBe(expected.segmentId);
  }

  if (expected.elapsedSeconds !== undefined) {
    expect(timer.elapsedSeconds).toBe(expected.elapsedSeconds);
  }

  if (expected.status === "stopped") {
    expect(timer.stoppedAt).toEqual(expect.any(String));
  }

  return timer as TimerDtoRecord;
}

function expectTimerEvents(
  runtime: AppRuntime,
  expectedTypes: readonly string[],
): AppEvent[] {
  const events = listTimerEvents(runtime);

  expect(events.map((event) => event.namespace)).toStrictEqual(
    expectedTypes.map(() => timerNamespace),
  );
  expect(events.map((event) => event.type)).toStrictEqual(expectedTypes);
  expect(events.map((event) => event.sourcePluginId)).toStrictEqual(
    expectedTypes.map(() => timerPluginId),
  );

  for (const event of events) {
    expect(event.type).not.toMatch(/\./u);
  }

  return events;
}

function listTimerEvents(runtime: AppRuntime): AppEvent[] {
  return runtime.events.list({ namespace: timerNamespace });
}

function expectEventPayload(event: AppEvent | undefined): Record<string, unknown> {
  expect(event).toBeDefined();

  return readRecord(event?.payload, "timer event payload");
}

function getTimerGlobalActiveBarComponent(
  runtime: AppRuntime,
): ComponentType<TimerGlobalActiveBarProps> {
  const contribution = runtime.registries.slots
    .list({
      pluginId: timerPluginId,
      slot: timerGlobalFloatingSlot,
    })
    .find((slot) => slot.id === timerGlobalActiveBarSlotId);

  if (contribution === undefined) {
    throw new Error("Timer Plugin must register timer.global-active-bar.");
  }

  return (contribution as SlotContribution<TimerGlobalActiveBarProps>)
    .component as ComponentType<TimerGlobalActiveBarProps>;
}

function expectNoUnsafeDtoSurface(value: unknown): void {
  expect(() => JSON.stringify(value)).not.toThrow();
  expect(collectUnsafeDtoPaths(value)).toStrictEqual([]);
}

function collectUnsafeDtoPaths(value: unknown): string[] {
  const unsafePaths: string[] = [];
  const seen = new WeakSet<object>();
  const unsafeKeys = new Set([
    "cause",
    "commands",
    "context",
    "createdAt",
    "db",
    "event",
    "events",
    "filesystem",
    "handler",
    "metadata",
    "namespace",
    "nativeBridge",
    "pages",
    "payload",
    "pluginHost",
    "registries",
    "runtime",
    "secret",
    "services",
    "sourcePluginId",
    "stack",
    "store",
    "stores",
    "token",
    "transaction",
    "type",
  ]);

  function visit(current: unknown, pathPrefix: string): void {
    if (typeof current === "function") {
      unsafePaths.push(pathPrefix);
      return;
    }

    if (typeof current !== "object" || current === null) {
      return;
    }

    if (seen.has(current)) {
      return;
    }

    seen.add(current);

    for (const [key, child] of Object.entries(current)) {
      const childPath = pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`;

      if (unsafeKeys.has(key)) {
        unsafePaths.push(childPath);
      }

      visit(child, childPath);
    }
  }

  visit(value, "");

  return unsafePaths;
}

function expectNoDangerousDom(): void {
  // Security assertions need direct DOM inspection for executable elements.
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("script")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("img")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access
  expect(document.querySelector("iframe")).toBeNull();

  for (const element of [...document.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      expect(attribute.name).not.toMatch(/^on/iu);
      expect(attribute.value).not.toMatch(
        /(?:javascript:|data:text\/html|<script\b)/iu,
      );

      if (element instanceof HTMLAnchorElement && attribute.name === "href") {
        throw new Error(`Unexpected timer link href ${attribute.value}`);
      }
    }
  }
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} must be a record`).toBe(true);

  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function useFakeClock(isoInstant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
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
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
}

async function listNativeSurfaceChangesFromMaster(): Promise<string[]> {
  return runGitLines([
    "diff",
    "--name-only",
    "master",
    "--",
    ...nativeSurfaceEntrypoints,
  ]);
}

async function runGitLines(args: readonly string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
