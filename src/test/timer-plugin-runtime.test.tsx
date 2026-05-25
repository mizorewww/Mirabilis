import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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
import { disallowedNativeSurfaceChanges } from "./native-surface-guard";

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
  | "timer.switch"
  | "timer.add-note";

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

type TimeSegmentDtoRecord = Record<string, unknown> & {
  durationSeconds: number;
  endAt: string;
  notePageId?: string;
  pageId: string;
  segmentId: string;
  source: "timer";
  startAt: string;
};

type ExpectedTimeSegmentDto = {
  durationSeconds: number;
  endAt: string;
  notePageId?: string;
  pageId: string;
  segmentId: string;
  startAt: string;
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
  "timer.add-note",
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
const timerProductionFiles = [
  "src/plugins/timer/plugin.ts",
  "src/plugins/timer/components/TimerMetadataPlaceholder.tsx",
] as const;

describe("Timer Plugin runtime commands and active timer UI", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the canonical Timer commands and the global active-bar slot", async () => {
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
    expect(registeredCommandIds).not.toContain("timer.add_note");
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
    expect(startedPayload.startAt).toBe(timerStartedAt);
    expect(startedPayload).not.toHaveProperty("startedAt");
    expect(activeTimer.startedAt).toBe(timerStartedAt);
    expectNoUnsafeDtoSurface(result);
  });

  it("pauses, resumes, and stops with frozen elapsed time and a Timer-owned time segment", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: [
        "event-timer-started",
        "event-timer-paused",
        "event-timer-resumed",
        "event-timer-stopped",
        "event-time-segment-created",
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
    const stoppedAt = expectStoppedAt(stoppedTimer);
    const createdSegment = expectCreatedSegmentResult(stopResult, {
      durationSeconds: 120,
      endAt: stoppedAt,
      pageId: page.id,
      segmentId: startedTimer.segmentId,
      startAt: startedTimer.startedAt,
    });
    const events = expectTimerEvents(runtime, [
      "started",
      "paused",
      "resumed",
      "stopped",
      "time_segment_created",
    ]);

    expect(readRecord(stopResult, "timer.stop result").activeTimer).toBeNull();
    expect(stoppedTimer.segmentId).toBe(startedTimer.segmentId);
    expect(createdSegment).toStrictEqual(
      expectTimeSegmentCreatedEvent(events[4], {
        durationSeconds: 120,
        endAt: stoppedAt,
        pageId: page.id,
        segmentId: startedTimer.segmentId,
        startAt: startedTimer.startedAt,
      }),
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
        "event-time-segment-created",
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
    const stoppedTimer = expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: activeTimer.segmentId,
      elapsedSeconds: 25,
    });
    expectCreatedSegmentResult(stopResult, {
      durationSeconds: 25,
      endAt: expectStoppedAt(stoppedTimer),
      pageId: page.id,
      segmentId: activeTimer.segmentId,
      startAt: activeTimer.startedAt,
    });
    expectTimerEvents(runtime, [
      "started",
      "paused",
      "stopped",
      "time_segment_created",
    ]);
  });

  it("switches by stopping the previous active timer then starting the next without a pause event", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page-a", "timer-page-b"],
      eventIds: [
        "event-first-started",
        "event-first-stopped",
        "event-first-time-segment-created",
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
    const createdSegment = expectSegmentRecord(
      switchRecord.createdSegment,
      {
        durationSeconds: 45,
        endAt: expectStoppedAt(stoppedTimer),
        pageId: firstPage.id,
        segmentId: firstTimer.segmentId,
        startAt: firstTimer.startedAt,
      },
      "timer.switch createdSegment",
    );
    const activeTimer = expectTimerDto(switchRecord.activeTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "running",
      elapsedSeconds: 0,
    });
    const events = expectTimerEvents(runtime, [
      "started",
      "stopped",
      "time_segment_created",
      "started",
    ]);

    expect(stoppedTimer.segmentId).toBe(firstTimer.segmentId);
    expect(activeTimer.segmentId).not.toBe(firstTimer.segmentId);
    expect(createdSegment).toStrictEqual(
      expectTimeSegmentCreatedEvent(events[2], {
        durationSeconds: 45,
        endAt: expectStoppedAt(stoppedTimer),
        pageId: firstPage.id,
        segmentId: firstTimer.segmentId,
        startAt: firstTimer.startedAt,
      }),
    );
    expect(events.map((event) => event.type)).not.toContain("paused");
    expect(runtime.pages.list()).toHaveLength(2);
    expect(runtime.metadata.list({ namespace: timerNamespace })).toStrictEqual(
      [],
    );
    expectNoUnsafeDtoSurface(switchResult);
  });

  it("treats direct timer.start while active as a switch and returns both active and stopped timer DTOs", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["direct-start-page-a", "direct-start-page-b"],
      eventIds: [
        "event-first-started",
        "event-first-stopped",
        "event-first-time-segment-created",
        "event-second-started",
        "event-second-stopped",
        "event-second-time-segment-created",
        "event-second-restarted",
      ],
    });
    const firstPage = createPage(runtime, "Direct start first page");
    const secondPage = createPage(runtime, "Direct start second page");
    const firstStart = await executeTimerCommand(runtime, "timer.start", {
      pageId: firstPage.id,
    });
    const firstTimer = expectResultActiveTimer(firstStart, {
      pageId: firstPage.id,
      status: "running",
      elapsedSeconds: 0,
    });

    vi.advanceTimersByTime(35_000);

    const secondStart = await executeTimerCommand(runtime, "timer.start", {
      pageId: secondPage.id,
    });
    const secondStartRecord = readRecord(
      secondStart,
      "direct timer.start switch result",
    );
    const firstStopped = expectTimerDto(secondStartRecord.stoppedTimer, {
      pageId: firstPage.id,
      pageTitle: firstPage.title,
      status: "stopped",
      segmentId: firstTimer.segmentId,
      elapsedSeconds: 35,
    });
    const firstCreatedSegment = expectSegmentRecord(
      secondStartRecord.createdSegment,
      {
        durationSeconds: 35,
        endAt: expectStoppedAt(firstStopped),
        pageId: firstPage.id,
        segmentId: firstTimer.segmentId,
        startAt: firstTimer.startedAt,
      },
      "direct timer.start first createdSegment",
    );
    const secondTimer = expectTimerDto(secondStartRecord.activeTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "running",
      elapsedSeconds: 0,
    });

    vi.advanceTimersByTime(12_000);

    const samePageStart = await executeTimerCommand(runtime, "timer.start", {
      pageId: secondPage.id,
    });
    const samePageRecord = readRecord(
      samePageStart,
      "direct same-page timer.start result",
    );
    const previousSecondTimer = expectTimerDto(samePageRecord.stoppedTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "stopped",
      segmentId: secondTimer.segmentId,
      elapsedSeconds: 12,
    });
    const secondCreatedSegment = expectSegmentRecord(
      samePageRecord.createdSegment,
      {
        durationSeconds: 12,
        endAt: expectStoppedAt(previousSecondTimer),
        pageId: secondPage.id,
        segmentId: secondTimer.segmentId,
        startAt: secondTimer.startedAt,
      },
      "direct same-page timer.start createdSegment",
    );
    const restartedSecondTimer = expectTimerDto(samePageRecord.activeTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "running",
      elapsedSeconds: 0,
    });
    const events = expectTimerEvents(runtime, [
      "started",
      "stopped",
      "time_segment_created",
      "started",
      "stopped",
      "time_segment_created",
      "started",
    ]);

    expect(firstStopped.segmentId).toBe(firstTimer.segmentId);
    expect(previousSecondTimer.segmentId).toBe(secondTimer.segmentId);
    expect(restartedSecondTimer.segmentId).not.toBe(secondTimer.segmentId);
    expect(firstCreatedSegment).toStrictEqual(
      expectTimeSegmentCreatedEvent(events[2], {
        durationSeconds: 35,
        endAt: expectStoppedAt(firstStopped),
        pageId: firstPage.id,
        segmentId: firstTimer.segmentId,
        startAt: firstTimer.startedAt,
      }),
    );
    expect(secondCreatedSegment).toStrictEqual(
      expectTimeSegmentCreatedEvent(events[5], {
        durationSeconds: 12,
        endAt: expectStoppedAt(previousSecondTimer),
        pageId: secondPage.id,
        segmentId: secondTimer.segmentId,
        startAt: secondTimer.startedAt,
      }),
    );
    expect(events.map((event) => event.type)).not.toContain("paused");
    expect(
      events
        .filter((event) => event.type === "started")
        .map((event) => expectEventPayload(event)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startAt: timerStartedAt }),
      ]),
    );
    expect(
      events
        .filter((event) => event.type === "started")
        .some((event) =>
          Object.prototype.hasOwnProperty.call(
            expectEventPayload(event),
            "startedAt",
          ),
        ),
    ).toBe(false);
    expectNoUnsafeDtoSurface([secondStart, samePageStart]);
  });

  it("pins switch edge behavior for no-active, paused, same-page, and missing-page cases", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["switch-edge-page-a", "switch-edge-page-b"],
      eventIds: [
        "event-switch-started",
        "event-switch-paused",
        "event-switch-stopped",
        "event-switch-time-segment-created",
        "event-second-started",
        "event-second-stopped",
        "event-second-time-segment-created",
        "event-second-restarted",
        "event-final-stopped",
        "event-final-time-segment-created",
      ],
    });
    const firstPage = createPage(runtime, "Switch edge first page");
    const secondPage = createPage(runtime, "Switch edge second page");

    const noActiveSwitch = await executeTimerCommand(runtime, "timer.switch", {
      pageId: firstPage.id,
    });
    const noActiveSwitchRecord = readRecord(
      noActiveSwitch,
      "no-active timer.switch result",
    );
    const firstTimer = expectTimerDto(noActiveSwitchRecord.activeTimer, {
      pageId: firstPage.id,
      pageTitle: firstPage.title,
      status: "running",
      elapsedSeconds: 0,
    });

    expect(noActiveSwitchRecord.stoppedTimer).toBeUndefined();
    expect(noActiveSwitchRecord.createdSegment).toBeUndefined();
    expectTimerEvents(runtime, ["started"]);

    vi.advanceTimersByTime(20_000);
    await executeTimerCommand(runtime, "timer.pause");

    vi.advanceTimersByTime(30_000);

    const pausedSwitch = await executeTimerCommand(runtime, "timer.switch", {
      pageId: secondPage.id,
    });
    const pausedSwitchRecord = readRecord(
      pausedSwitch,
      "paused timer.switch result",
    );
    const pausedStoppedTimer = expectTimerDto(pausedSwitchRecord.stoppedTimer, {
      pageId: firstPage.id,
      pageTitle: firstPage.title,
      status: "stopped",
      segmentId: firstTimer.segmentId,
      elapsedSeconds: 20,
    });
    expectSegmentRecord(
      pausedSwitchRecord.createdSegment,
      {
        durationSeconds: 20,
        endAt: expectStoppedAt(pausedStoppedTimer),
        pageId: firstPage.id,
        segmentId: firstTimer.segmentId,
        startAt: firstTimer.startedAt,
      },
      "paused timer.switch createdSegment",
    );
    const secondTimer = expectTimerDto(pausedSwitchRecord.activeTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "running",
      elapsedSeconds: 0,
    });

    vi.advanceTimersByTime(9_000);

    const samePageSwitch = await executeTimerCommand(runtime, "timer.switch", {
      pageId: secondPage.id,
    });
    const samePageSwitchRecord = readRecord(
      samePageSwitch,
      "same-page timer.switch result",
    );
    const samePageStoppedTimer = expectTimerDto(samePageSwitchRecord.stoppedTimer, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "stopped",
      segmentId: secondTimer.segmentId,
      elapsedSeconds: 9,
    });
    expectSegmentRecord(
      samePageSwitchRecord.createdSegment,
      {
        durationSeconds: 9,
        endAt: expectStoppedAt(samePageStoppedTimer),
        pageId: secondPage.id,
        segmentId: secondTimer.segmentId,
        startAt: secondTimer.startedAt,
      },
      "same-page timer.switch createdSegment",
    );
    const restartedSecondTimer = expectTimerDto(
      samePageSwitchRecord.activeTimer,
      {
        pageId: secondPage.id,
        pageTitle: secondPage.title,
        status: "running",
        elapsedSeconds: 0,
      },
    );
    const eventsBeforeMissingSwitch = listTimerEvents(runtime);

    await expect(
      executeTimerCommand(runtime, "timer.switch", {
        pageId: "missing-switch-page",
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(listTimerEvents(runtime)).toStrictEqual(eventsBeforeMissingSwitch);

    const stopAfterMissingSwitch = await executeTimerCommand(runtime, "timer.stop");
    const finalStoppedTimer = expectStoppedTimerResult(stopAfterMissingSwitch, {
      pageId: secondPage.id,
      pageTitle: secondPage.title,
      status: "stopped",
      segmentId: restartedSecondTimer.segmentId,
    });
    expectCreatedSegmentResult(stopAfterMissingSwitch, {
      durationSeconds: finalStoppedTimer.elapsedSeconds,
      endAt: expectStoppedAt(finalStoppedTimer),
      pageId: secondPage.id,
      segmentId: restartedSecondTimer.segmentId,
      startAt: restartedSecondTimer.startedAt,
    });
    expectTimerEvents(runtime, [
      "started",
      "paused",
      "stopped",
      "time_segment_created",
      "started",
      "stopped",
      "time_segment_created",
      "started",
      "stopped",
      "time_segment_created",
    ]);
  });

  it("rejects malformed, extra, and caller-owned payload fields without changing active state or appending events", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["timer-page"],
      eventIds: [
        "event-timer-started",
        "event-timer-stopped",
        "event-time-segment-created",
      ],
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
    expectTimerEvents(runtime, ["started", "stopped", "time_segment_created"]);
  });

  it("rejects unsafe timer.stop finalization payloads without event, page, or active-state mutation", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["unsafe-stop-page"],
      eventIds: [
        "event-unsafe-stop-started",
        "event-unsafe-stop-stopped",
        "event-unsafe-stop-time-segment-created",
      ],
    });
    const page = createPage(runtime, "Unsafe stop timer");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(startResult, {
      pageId: page.id,
      status: "running",
    });
    const originalEvents = listTimerEvents(runtime);
    const originalPages = runtime.pages.list({ includeArchived: true });
    const originalMetadata = runtime.metadata.list({ namespace: timerNamespace });
    const invalidStopInputs: Array<{ input: unknown; label: string }> = [
      { input: { pageId: page.id }, label: "pageId field" },
      { input: { segmentId: activeTimer.segmentId }, label: "segmentId field" },
      { input: { startAt: timerStartedAt }, label: "startAt field" },
      { input: { startedAt: timerStartedAt }, label: "startedAt field" },
      { input: { endAt: timerStartedAt }, label: "endAt field" },
      { input: { stoppedAt: timerStartedAt }, label: "stoppedAt field" },
      { input: { durationSeconds: 1 }, label: "durationSeconds field" },
      { input: { notePageId: "caller-note-page" }, label: "notePageId field" },
      { input: { source: "manual" }, label: "source field" },
      { input: { sourcePluginId: timerPluginId }, label: "sourcePluginId field" },
      { input: { ownerPluginId: timerPluginId }, label: "ownerPluginId field" },
      { input: { namespace: timerNamespace }, label: "namespace field" },
      { input: { type: "time_segment_created" }, label: "event type field" },
      { input: { eventId: "caller-event" }, label: "eventId field" },
      { input: { createdAt: timerStartedAt }, label: "createdAt field" },
      { input: [activeTimer.segmentId], label: "array payload" },
      {
        input: createClassInstancePayload(page.id),
        label: "class instance payload",
      },
      {
        input: createAccessorExtraPayload("segmentId", activeTimer.segmentId),
        label: "accessor payload",
      },
      {
        input: createSymbolOnlyPayload("segmentId", activeTimer.segmentId),
        label: "symbol-key payload",
      },
      {
        input: createNonEnumerableOnlyPayload(
          "segmentId",
          activeTimer.segmentId,
        ),
        label: "non-enumerable payload",
      },
      {
        input: createPrototypeCarriedOnlyPayload(
          "segmentId",
          activeTimer.segmentId,
        ),
        label: "prototype-carried payload",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "__proto__"),
        label: "__proto__ payload key",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "constructor"),
        label: "constructor payload key",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "prototype"),
        label: "prototype payload key",
      },
      {
        input: createNullPrototypeExtraPayload(
          "segmentId",
          activeTimer.segmentId,
        ),
        label: "non-empty null-prototype payload",
      },
    ];

    for (const { input, label } of invalidStopInputs) {
      await expect(
        executeTimerCommand(runtime, "timer.stop", input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(listTimerEvents(runtime), label).toStrictEqual(originalEvents);
      expect(runtime.pages.list({ includeArchived: true }), label).toStrictEqual(
        originalPages,
      );
      expect(runtime.metadata.list({ namespace: timerNamespace }), label)
        .toStrictEqual(originalMetadata);
    }

    const stopResult = await executeTimerCommand(runtime, "timer.stop");
    expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: activeTimer.segmentId,
    });
    expectTimerEvents(runtime, ["started", "stopped", "time_segment_created"]);
  });

  it("rejects descriptor-unsafe and prototype-shaped payloads without mutating active timer state or events", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["descriptor-safe-page"],
      eventIds: Array.from(
        { length: 51 },
        (_unused, index) => `event-descriptor-${index}`,
      ),
    });
    const page = createPage(runtime, "Descriptor-safe timer payloads");
    const startResult = await executeTimerCommand(runtime, "timer.start", {
      pageId: page.id,
    });
    const activeTimer = expectResultActiveTimer(startResult, {
      pageId: page.id,
      status: "running",
    });
    const originalEvents = listTimerEvents(runtime);
    const invalidPageInputs: Array<{ input: unknown; label: string }> = [
      { input: [page.id], label: "array page payload" },
      {
        input: createClassInstancePayload(page.id),
        label: "class instance page payload",
      },
      {
        input: createAccessorPagePayload(page.id),
        label: "accessor pageId payload",
      },
      {
        input: createSymbolExtraPayload(page.id),
        label: "symbol-key extra payload",
      },
      {
        input: createNonEnumerableExtraPayload(page.id),
        label: "non-enumerable extra payload",
      },
      {
        input: createPrototypeCarriedExtraPayload(page.id),
        label: "prototype-carried extra payload",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "__proto__"),
        label: "__proto__ payload key",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "constructor"),
        label: "constructor payload key",
      },
      {
        input: createPrototypeShapedKeyPayload(page.id, "prototype"),
        label: "prototype payload key",
      },
      {
        input: createNullPrototypePagePayload(page.id),
        label: "non-empty null-prototype page payload",
      },
    ];

    for (const commandId of ["timer.start", "timer.switch"] as const) {
      for (const { input, label } of invalidPageInputs) {
        await expect(
          executeTimerCommand(runtime, commandId, input),
          `${commandId} ${label}`,
        ).rejects.toBeInstanceOf(Error);
        expect(listTimerEvents(runtime), `${commandId} ${label}`).toStrictEqual(
          originalEvents,
        );
      }
    }

    const invalidEmptyCommandInputs: Array<{
      commandId: Extract<
        TimerCommandId,
        "timer.pause" | "timer.resume" | "timer.stop"
      >;
      input: unknown;
      label: string;
    }> = [
      {
        commandId: "timer.pause",
        input: createNullPrototypeExtraPayload("segmentId", "caller-segment"),
        label: "null-prototype pause extra payload",
      },
      {
        commandId: "timer.resume",
        input: createNullPrototypeExtraPayload("durationSeconds", 1),
        label: "null-prototype resume extra payload",
      },
      {
        commandId: "timer.stop",
        input: createNullPrototypeExtraPayload("sourcePluginId", timerPluginId),
        label: "null-prototype stop extra payload",
      },
    ];

    for (const { commandId, input, label } of invalidEmptyCommandInputs) {
      await expect(
        executeTimerCommand(runtime, commandId, input),
        label,
      ).rejects.toBeInstanceOf(Error);
      expect(listTimerEvents(runtime), label).toStrictEqual(originalEvents);
    }

    const pausedResult = await executeTimerCommand(
      runtime,
      "timer.pause",
      createNullPrototypeEmptyPayload(),
    );
    expectResultActiveTimer(pausedResult, {
      pageId: page.id,
      status: "paused",
      segmentId: activeTimer.segmentId,
    });
    expectTimerEvents(runtime, ["started", "paused"]);

    const resumedResult = await executeTimerCommand(
      runtime,
      "timer.resume",
      createNullPrototypeEmptyPayload(),
    );
    expectResultActiveTimer(resumedResult, {
      pageId: page.id,
      status: "running",
      segmentId: activeTimer.segmentId,
    });
    expectTimerEvents(runtime, ["started", "paused", "resumed"]);

    const stopResult = await executeTimerCommand(
      runtime,
      "timer.stop",
      createNullPrototypeEmptyPayload(),
    );
    const stoppedTimer = expectStoppedTimerResult(stopResult, {
      pageId: page.id,
      status: "stopped",
      segmentId: activeTimer.segmentId,
    });
    expectCreatedSegmentResult(stopResult, {
      durationSeconds: stoppedTimer.elapsedSeconds,
      endAt: expectStoppedAt(stoppedTimer),
      pageId: page.id,
      segmentId: activeTimer.segmentId,
      startAt: activeTimer.startedAt,
    });
    expectTimerEvents(runtime, [
      "started",
      "paused",
      "resumed",
      "stopped",
      "time_segment_created",
    ]);
  });

  it("executes active-bar Pause, Resume, and Stop through exact Timer command IDs with empty payloads", async () => {
    const runtime = await createRuntime({
      pageIds: ["active-bar-command-page"],
      eventIds: [
        "event-command-started",
        "event-command-paused",
        "event-command-resumed",
        "event-command-stopped",
        "event-command-time-segment-created",
      ],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Active bar command surface");
    const ActiveTimerBar = getTimerGlobalActiveBarComponent(runtime);
    const execute = vi.fn(
      (commandId: string, input?: unknown): Promise<unknown> =>
        runtime.commands.execute(commandId, input),
    );

    await executeTimerCommand(runtime, "timer.start", { pageId: page.id });
    render(createElement(ActiveTimerBar, { commands: { execute } }));

    const activeTimer = screen.getByRole("region", { name: /active timer/i });

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenNthCalledWith(1, "timer.pause", {});
    expect(execute.mock.calls).toStrictEqual([["timer.pause", {}]]);

    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /resume/i }),
      ).toBeEnabled(),
    );

    await user.click(
      within(activeTimer).getByRole("button", { name: /resume/i }),
    );
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenNthCalledWith(2, "timer.resume", {});
    expect(execute.mock.calls).toStrictEqual([
      ["timer.pause", {}],
      ["timer.resume", {}],
    ]);

    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /pause/i }),
      ).toBeEnabled(),
    );

    await user.click(within(activeTimer).getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    expect(execute).toHaveBeenNthCalledWith(3, "timer.stop", {});
    expect(execute.mock.calls).toStrictEqual([
      ["timer.pause", {}],
      ["timer.resume", {}],
      ["timer.stop", {}],
    ]);
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /active timer/i }),
      ).not.toBeInTheDocument(),
    );
    expectTimerEvents(runtime, [
      "started",
      "paused",
      "resumed",
      "stopped",
      "time_segment_created",
    ]);
  });

  it("keeps active timer state scoped to one Timer Plugin registration and never leaks across runtimes", async () => {
    useFakeClock(timerStartedAt);
    const firstRuntime = await createRuntime({
      pageIds: ["first-runtime-page"],
      eventIds: ["first-started", "first-stopped", "first-segment-created"],
    });
    const secondRuntime = await createRuntime({
      pageIds: ["second-runtime-page"],
      eventIds: ["second-started", "second-stopped", "second-segment-created"],
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
    expectTimerEvents(secondRuntime, [
      "started",
      "stopped",
      "time_segment_created",
    ]);

    const firstStop = await executeTimerCommand(firstRuntime, "timer.stop");
    expectStoppedTimerResult(firstStop, {
      pageId: firstPage.id,
      status: "stopped",
      segmentId: firstTimer.segmentId,
    });
    expectTimerEvents(firstRuntime, [
      "started",
      "stopped",
      "time_segment_created",
    ]);
  });

  it("updates the same visible active-bar elapsed element and state-driven controls while running, paused, resumed, and stopped", async () => {
    useFakeClock(timerStartedAt);
    const runtime = await createRuntime({
      pageIds: ["unsafe-title-page"],
      eventIds: [
        "event-started",
        "event-paused",
        "event-resumed",
        "event-stopped",
        "event-time-segment-created",
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
    const elapsed = within(activeTimer).getByText("00:00:00");

    expect(elapsed).toBeVisible();
    expect(
      within(activeTimer).getByRole("button", { name: /pause/i }),
    ).toBeEnabled();
    expect(
      within(activeTimer).getByRole("button", { name: /stop/i }),
    ).toBeEnabled();
    expect(
      within(activeTimer).getByRole("button", { name: /switch/i }),
    ).toBeVisible();
    expectNoDangerousDom();

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });

    expect(elapsed).toHaveTextContent("00:01:05");
    expect(within(activeTimer).getAllByText("00:01:05")).toStrictEqual([
      elapsed,
    ]);
    expect(
      within(activeTimer).queryByRole("button", { name: /resume/i }),
    ).not.toBeInTheDocument();

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /resume/i }),
      ).toBeEnabled(),
    );
    expect(
      within(activeTimer).queryByRole("button", { name: /pause/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(elapsed).toHaveTextContent("00:01:05");

    await user.click(
      within(activeTimer).getByRole("button", { name: /resume/i }),
    );
    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /pause/i }),
      ).toBeEnabled(),
    );
    expect(
      within(activeTimer).queryByRole("button", { name: /resume/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(elapsed).toHaveTextContent("00:01:20");
    expect(within(activeTimer).getAllByText("00:01:20")).toStrictEqual([
      elapsed,
    ]);

    await user.click(within(activeTimer).getByRole("button", { name: /stop/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /active timer/i }),
      ).not.toBeInTheDocument(),
    );
    expectTimerEvents(runtime, [
      "started",
      "paused",
      "resumed",
      "stopped",
      "time_segment_created",
    ]);
    expectNoDangerousDom();
  });

  it("recovers visible active-bar updates after a rejected control command", async () => {
    const runtime = await createRuntime({
      pageIds: ["rejected-control-page"],
      eventIds: [
        "event-started",
        "event-paused",
        "event-stopped",
        "event-time-segment-created",
      ],
    });
    const user = userEvent.setup();
    const page = createPage(runtime, "Rejected control page");
    const ActiveTimerBar = getTimerGlobalActiveBarComponent(runtime);
    const execute = vi.fn(
      async (commandId: string, input?: unknown): Promise<unknown> => {
        if (commandId === "timer.pause") {
          throw new Error("Injected rejected control");
        }

        return runtime.commands.execute(commandId, input);
      },
    );

    await executeTimerCommand(runtime, "timer.start", { pageId: page.id });
    render(createElement(ActiveTimerBar, { commands: { execute } }));

    const activeTimer = screen.getByRole("region", { name: /active timer/i });

    await user.click(within(activeTimer).getByRole("button", { name: /pause/i }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith("timer.pause", {}),
    );

    await act(async () => {
      await executeTimerCommand(runtime, "timer.pause");
    });

    await waitFor(() =>
      expect(
        within(activeTimer).getByRole("button", { name: /resume/i }),
      ).toBeEnabled(),
    );
    expect(
      within(activeTimer).queryByRole("button", { name: /pause/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await executeTimerCommand(runtime, "timer.stop");
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /active timer/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps Timer production code free of test monkeypatches, eval, and broad active-bar command execution", async () => {
    const sources = await readTimerProductionSources();
    const forbiddenPatterns = [
      {
        label: "Function constructor eval",
        pattern: /\b(?:new\s+)?Function\s*\(/u,
      },
      {
        label: "string timer handler execution",
        pattern: /\bTimerHandler\b|typeof\s+handler\s*===\s*["']string["']/u,
      },
      {
        label: "window.setTimeout monkeypatch",
        pattern: /window\.setTimeout\s*=/u,
      },
      {
        label: "production jsdom branch",
        pattern: /\bjsdom\b/iu,
      },
      {
        label: "global setTimeout fake-clock probing",
        pattern:
          /(?:globalThis|global|window)\.setTimeout(?:\s*\.\s*clock|[^;{}]*,\s*["']clock["'])/u,
      },
      {
        label: "Object.defineProperty setTimeout replacement",
        pattern:
          /Object\.defineProperty\s*\(\s*(?:globalThis|global|window)\s*,\s*["']setTimeout["']/u,
      },
      {
        label: "controlled clock bridge or shim",
        pattern:
          /\bcontrolledClock(?:Timeout)?Bridge\b|\bcreateControlledClockTimeoutBridge\b|\b(?:fake|controlled)\w*Clock\w*(?:Bridge|Shim)\b|\b(?:Bridge|Shim)\w*setTimeout\b/iu,
      },
      {
        label: "host setTimeout snapshot for replacement",
        pattern:
          /\b(?:host|original|native)\w*SetTimeout\s*=\s*(?:globalThis|global|window)\.setTimeout\b/iu,
      },
      {
        label: "bridge setTimeout replacement",
        pattern: /\bbridgeSetTimeout\b/iu,
      },
      {
        label: "string-handler timer forwarding",
        pattern:
          /\boriginalSetTimeout\s*\(\s*callback\b|\bTimerHandler\b|typeof\s+\w+\s*===\s*["']string["']/u,
      },
    ];
    const violations = sources.flatMap(({ filePath, source }) =>
      forbiddenPatterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => `${filePath}: ${label}`),
    );
    const timerPluginSource =
      sources.find(({ filePath }) => filePath === "src/plugins/timer/plugin.ts")
        ?.source ?? "";

    if (/\bcommands\.execute\s*\(/u.test(timerPluginSource)) {
      violations.push(
        "src/plugins/timer/plugin.ts: broad active-bar command executor",
      );
    }

    expect(violations).toStrictEqual([]);
  });

  it("does not require native, Tauri, package, Cargo, permission, IPC, or command-surface changes", async () => {
    expect(
      await disallowedNativeSurfaceChanges(
        await listNativeSurfaceChangesFromMaster(),
      ),
    ).toStrictEqual([]);
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

function expectCreatedSegmentResult(
  result: unknown,
  expected: ExpectedTimeSegmentDto,
): TimeSegmentDtoRecord {
  const resultRecord = readRecord(result, "timer command result");

  return expectSegmentRecord(
    resultRecord.createdSegment,
    expected,
    "createdSegment DTO",
  );
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

function expectStoppedAt(timer: TimerDtoRecord): string {
  expect(timer.stoppedAt).toEqual(expect.any(String));

  return timer.stoppedAt as string;
}

function expectTimeSegmentCreatedEvent(
  event: AppEvent | undefined,
  expected: ExpectedTimeSegmentDto,
): TimeSegmentDtoRecord {
  expect(event).toMatchObject({
    pageId: expected.pageId,
    namespace: timerNamespace,
    type: "time_segment_created",
    sourcePluginId: timerPluginId,
  });

  const payload = expectSegmentRecord(
    expectEventPayload(event),
    expected,
    "timer.time_segment_created payload",
  );

  expect(event?.pageId).toBe(payload.pageId);

  return payload;
}

function expectSegmentRecord(
  value: unknown,
  expected: ExpectedTimeSegmentDto,
  label: string,
): TimeSegmentDtoRecord {
  const segment = readRecord(value, label);
  const expectedKeys = [
    "durationSeconds",
    "endAt",
    "pageId",
    "segmentId",
    "source",
    "startAt",
    ...(expected.notePageId === undefined ? [] : ["notePageId"]),
  ];

  expect(Object.keys(segment).sort()).toStrictEqual(expectedKeys.sort());
  expect(segment.segmentId).toBe(expected.segmentId);
  expect(segment.pageId).toBe(expected.pageId);
  expect(segment.startAt).toBe(expected.startAt);
  expect(segment.endAt).toBe(expected.endAt);
  expect(segment.durationSeconds).toBe(expected.durationSeconds);
  expect(segment.source).toBe("timer");

  if (expected.notePageId === undefined) {
    expect(segment).not.toHaveProperty("notePageId");
  } else {
    expect(segment.notePageId).toBe(expected.notePageId);
  }

  return segment as TimeSegmentDtoRecord;
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

class TimerPagePayload {
  pageId: string;

  constructor(pageId: string) {
    this.pageId = pageId;
  }
}

function createClassInstancePayload(pageId: string): unknown {
  return new TimerPagePayload(pageId);
}

function createAccessorPagePayload(pageId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, "pageId", {
    enumerable: true,
    get() {
      return pageId;
    },
  });

  return payload;
}

function createAccessorExtraPayload(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, key, {
    enumerable: true,
    get() {
      return value;
    },
  });

  return payload;
}

function createSymbolExtraPayload(pageId: string): Record<string, unknown> {
  const payload = { pageId } as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol("segmentId"), {
    enumerable: true,
    value: "caller-segment",
  });

  return payload as Record<string, unknown>;
}

function createSymbolOnlyPayload(
  keyLabel: string,
  value: unknown,
): Record<string, unknown> {
  const payload = {} as Record<PropertyKey, unknown>;

  Object.defineProperty(payload, Symbol(keyLabel), {
    enumerable: true,
    value,
  });

  return payload as Record<string, unknown>;
}

function createNonEnumerableExtraPayload(pageId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { pageId };

  Object.defineProperty(payload, "segmentId", {
    enumerable: false,
    value: "caller-segment",
  });

  return payload;
}

function createNonEnumerableOnlyPayload(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  Object.defineProperty(payload, key, {
    enumerable: false,
    value,
  });

  return payload;
}

function createPrototypeCarriedExtraPayload(
  pageId: string,
): Record<string, unknown> {
  const payload = Object.create({
    segmentId: "caller-segment",
  }) as Record<string, unknown>;

  payload.pageId = pageId;

  return payload;
}

function createPrototypeCarriedOnlyPayload(
  key: string,
  value: unknown,
): Record<string, unknown> {
  return Object.create({
    [key]: value,
  }) as Record<string, unknown>;
}

function createPrototypeShapedKeyPayload(
  pageId: string,
  key: "__proto__" | "constructor" | "prototype",
): Record<string, unknown> {
  const payload: Record<string, unknown> = { pageId };

  Object.defineProperty(payload, key, {
    enumerable: true,
    value: "caller-controlled",
  });

  return payload;
}

function createNullPrototypeEmptyPayload(): Record<string, never> {
  return Object.create(null) as Record<string, never>;
}

function createNullPrototypePagePayload(pageId: string): Record<string, unknown> {
  const payload = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(payload, "pageId", {
    enumerable: true,
    value: pageId,
  });

  return payload;
}

function createNullPrototypeExtraPayload(
  key: string,
  value: unknown,
): Record<string, unknown> {
  const payload = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(payload, key, {
    enumerable: true,
    value,
  });

  return payload;
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

async function readTimerProductionSources(): Promise<
  Array<{ filePath: string; source: string }>
> {
  return Promise.all(
    timerProductionFiles.map(async (filePath) => ({
      filePath,
      source: await readFile(path.join(repoRoot, filePath), "utf8"),
    })),
  );
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
