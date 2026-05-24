import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";

import {
  exportStructuredDocumentToMarkdown,
  importMarkdownToStructuredDocument,
  type AppEvent,
  AppPlugin,
  MarkdownPage,
  PluginContext,
  PluginTransaction,
} from "../../core";
import { TimerMetadataPlaceholder } from "./components/TimerMetadataPlaceholder";

type TimerCommandResult = {
  activeTimer: TimerDto | null;
  createdSegment?: TimeSegmentDto;
  stoppedTimer?: TimerDto;
};

type TimerNoteResult = {
  notePageId: string;
};

type TimerDto = {
  elapsedSeconds: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startedAt: string;
  status: TimerDtoStatus;
  stoppedAt?: string;
};

type TimerDtoStatus = ActiveTimerStatus | "stopped";

type ActiveTimerStatus = "running" | "paused";

type ActiveTimerState = {
  elapsedMs: number;
  lastResumedAtMs: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startedAt: string;
  status: ActiveTimerStatus;
};

type StoppedTimerState = Omit<ActiveTimerState, "lastResumedAtMs" | "status"> & {
  status: "stopped";
  stoppedAt: string;
};

type TimeSegmentDto = {
  durationSeconds: number;
  endAt: string;
  notePageId?: string;
  pageId: string;
  segmentId: string;
  source: "timer";
  startAt: string;
};

type FinalizedTimer = {
  createdSegment: TimeSegmentDto;
  stoppedTimer: StoppedTimerState;
};

type ActiveTimerStore = {
  getSnapshot(): ActiveTimerState | null;
  setActive(timer: ActiveTimerState | null): void;
  subscribe(listener: () => void): () => void;
};

type TimerGlobalActiveBarProps = {
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

type TimerPageTimelineProps = {
  page: Pick<MarkdownPage, "id" | "title">;
};

const timerMetadataSlotId = "timer.page-header-metadata.placeholder";
const timerGlobalActiveBarSlotId = "timer.global-active-bar";
const timerPageTimelineSlotId = "timer.page-timeline.segments";
const pageHeaderMetadataSlot = "page.header.metadata";
const globalFloatingSlot = "global.floating";
const pageTimelineSlot = "page.timeline";
const timerNamespace = "timer";
const startTimerCommandId = "timer.start";
const stopTimerCommandId = "timer.stop";
const pauseTimerCommandId = "timer.pause";
const resumeTimerCommandId = "timer.resume";
const switchTimerCommandId = "timer.switch";
const addTimerNoteCommandId = "timer.add-note";
const timeSegmentCreatedType = "time_segment_created";
const timeSegmentNoteAddedType = "time_segment_note_added";
const pageTimerInputKeys = new Set(["pageId"]);
const timerNoteInputKeys = new Set(["segmentId", "markdown"]);
const unsafePayloadKeys = new Set(["__proto__", "constructor", "prototype"]);

export const TimerPlugin: AppPlugin = {
  manifest: {
    id: "timer",
    name: "Timer Plugin",
    version: "1.0.0",
    description: "Track one active timer through plugin-owned runtime state.",
    minAppVersion: "0.1.0",
  },
  register(ctx) {
    const activeTimers = createActiveTimerStore();

    ctx.commands.register({
      id: startTimerCommandId,
      title: "Start timer",
      handler: (input, commandCtx) =>
        startTimer(input, commandCtx, activeTimers),
    });

    ctx.commands.register({
      id: stopTimerCommandId,
      title: "Stop timer",
      handler: (input, commandCtx) =>
        stopTimer(input, commandCtx, activeTimers),
    });

    ctx.commands.register({
      id: pauseTimerCommandId,
      title: "Pause timer",
      handler: (input, commandCtx) =>
        pauseTimer(input, commandCtx, activeTimers),
    });

    ctx.commands.register({
      id: resumeTimerCommandId,
      title: "Resume timer",
      handler: (input, commandCtx) =>
        resumeTimer(input, commandCtx, activeTimers),
    });

    ctx.commands.register({
      id: switchTimerCommandId,
      title: "Switch timer",
      handler: (input, commandCtx) =>
        switchTimer(input, commandCtx, activeTimers),
    });

    ctx.commands.register({
      id: addTimerNoteCommandId,
      title: "Add time segment note",
      handler: (input, commandCtx) =>
        addTimeSegmentNote(input, commandCtx, activeTimers),
    });

    ctx.slots.register({
      id: timerMetadataSlotId,
      slot: pageHeaderMetadataSlot,
      order: 400,
      component: TimerMetadataPlaceholder,
    });

    ctx.slots.register({
      id: timerGlobalActiveBarSlotId,
      slot: globalFloatingSlot,
      order: 100,
      component: createTimerGlobalActiveBar(activeTimers),
    });

    ctx.slots.register({
      id: timerPageTimelineSlotId,
      slot: pageTimelineSlot,
      order: 100,
      component: createTimerPageTimeline(ctx),
    });
  },
};

async function startTimer(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerCommandResult> {
  const payload = readPageTimerInput(input, startTimerCommandId);
  const result = await ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);
    const existingTimer = store.getSnapshot();
    const finalizedTimer =
      existingTimer === null ? null : finalizeActiveTimer(tx, existingTimer);
    const startedTimer = createStartedTimer(page);

    appendStartedEvent(tx, startedTimer);

    return {
      activeTimer: startedTimer,
      finalizedTimer,
    };
  });

  store.setActive(result.activeTimer);

  return {
    activeTimer: toTimerDto(result.activeTimer),
    ...(result.finalizedTimer === null
      ? {}
      : {
          createdSegment: result.finalizedTimer.createdSegment,
          stoppedTimer: toTimerDto(result.finalizedTimer.stoppedTimer),
        }),
  };
}

async function pauseTimer(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerCommandResult> {
  readEmptyTimerInput(input, pauseTimerCommandId);

  const activeTimer = store.getSnapshot();

  if (activeTimer === null || activeTimer.status !== "running") {
    throw new Error("Timer pause requires a running active timer");
  }

  const pausedTimer = await ctx.transaction.run((tx) => {
    const nextTimer = pauseActiveTimer(activeTimer);

    tx.events.append({
      pageId: nextTimer.pageId,
      namespace: timerNamespace,
      type: "paused",
      payload: {
        segmentId: nextTimer.segmentId,
        pausedAt: createCurrentInstant(),
        elapsedSeconds: elapsedSeconds(nextTimer.elapsedMs),
      },
    });

    return nextTimer;
  });

  store.setActive(pausedTimer);

  return {
    activeTimer: toTimerDto(pausedTimer),
  };
}

async function resumeTimer(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerCommandResult> {
  readEmptyTimerInput(input, resumeTimerCommandId);

  const activeTimer = store.getSnapshot();

  if (activeTimer === null || activeTimer.status !== "paused") {
    throw new Error("Timer resume requires a paused active timer");
  }

  const resumedTimer = await ctx.transaction.run((tx) => {
    const resumedAtMs = Date.now();
    const nextTimer: ActiveTimerState = {
      ...activeTimer,
      lastResumedAtMs: resumedAtMs,
      status: "running",
    };

    tx.events.append({
      pageId: nextTimer.pageId,
      namespace: timerNamespace,
      type: "resumed",
      payload: {
        segmentId: nextTimer.segmentId,
        resumedAt: createInstantFromMs(resumedAtMs),
        elapsedSeconds: elapsedSeconds(nextTimer.elapsedMs),
      },
    });

    return nextTimer;
  });

  store.setActive(resumedTimer);

  return {
    activeTimer: toTimerDto(resumedTimer),
  };
}

async function stopTimer(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerCommandResult> {
  readEmptyTimerInput(input, stopTimerCommandId);

  const activeTimer = store.getSnapshot();

  if (activeTimer === null) {
    throw new Error("Timer stop requires an active timer");
  }

  const finalizedTimer = await ctx.transaction.run((tx) =>
    finalizeActiveTimer(tx, activeTimer),
  );

  store.setActive(null);

  return {
    activeTimer: null,
    createdSegment: finalizedTimer.createdSegment,
    stoppedTimer: toTimerDto(finalizedTimer.stoppedTimer),
  };
}

async function switchTimer(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerCommandResult> {
  const payload = readPageTimerInput(input, switchTimerCommandId);
  const currentTimer = store.getSnapshot();
  const result = await ctx.transaction.run((tx) => {
    const page = tx.pages.get(payload.pageId);
    const finalizedTimer =
      currentTimer === null ? null : finalizeActiveTimer(tx, currentTimer);
    const activeTimer = createStartedTimer(page);

    appendStartedEvent(tx, activeTimer);

    return {
      activeTimer,
      finalizedTimer,
    };
  });

  store.setActive(result.activeTimer);

  return {
    activeTimer: toTimerDto(result.activeTimer),
    ...(result.finalizedTimer === null
      ? {}
      : {
          createdSegment: result.finalizedTimer.createdSegment,
          stoppedTimer: toTimerDto(result.finalizedTimer.stoppedTimer),
        }),
  };
}

async function addTimeSegmentNote(
  input: unknown,
  ctx: PluginContext,
  store: ActiveTimerStore,
): Promise<TimerNoteResult> {
  const payload = readTimerNoteInput(input);
  const activeTimer = store.getSnapshot();

  if (activeTimer?.segmentId === payload.segmentId) {
    throw new Error("Timer note requires a stopped time segment");
  }

  return ctx.transaction.run((tx) => {
    const activeTimerInTransaction = store.getSnapshot();

    if (activeTimerInTransaction?.segmentId === payload.segmentId) {
      throw new Error("Timer note requires a stopped time segment");
    }

    const timerEvents = tx.events.list({ namespace: timerNamespace });
    const segment = findTimerSegment(timerEvents, payload.segmentId);

    if (segment === undefined) {
      throw new Error("Timer note requires a known stopped time segment");
    }

    const existingNotePageId = findLatestNotePageId(
      timerEvents,
      segment.segmentId,
      segment.pageId,
    );
    const noteBody = importMarkdownToStructuredDocument(payload.markdown);
    const notePage =
      existingNotePageId === undefined
        ? tx.pages.create({
            title: "Time Segment Note",
            body: noteBody,
          })
        : tx.pages.update(existingNotePageId, {
            body: noteBody,
          });
    const notedAt = createCurrentInstant();

    tx.events.append({
      pageId: segment.pageId,
      namespace: timerNamespace,
      type: timeSegmentNoteAddedType,
      payload: {
        segmentId: segment.segmentId,
        notePageId: notePage.id,
        notedAt,
      },
    });

    return {
      notePageId: notePage.id,
    };
  });
}

function appendStartedEvent(
  tx: PluginTransaction,
  timer: ActiveTimerState,
): void {
  tx.events.append({
    pageId: timer.pageId,
    namespace: timerNamespace,
    type: "started",
    payload: {
      segmentId: timer.segmentId,
      startAt: timer.startedAt,
    },
  });
}

function appendStoppedEvent(
  tx: PluginTransaction,
  timer: ActiveTimerState,
): StoppedTimerState {
  const stoppedAtMs = Date.now();
  const stoppedTimer: StoppedTimerState = {
    elapsedMs: calculateElapsedMs(timer, stoppedAtMs),
    pageId: timer.pageId,
    pageTitle: timer.pageTitle,
    segmentId: timer.segmentId,
    startedAt: timer.startedAt,
    status: "stopped",
    stoppedAt: createInstantFromMs(stoppedAtMs),
  };

  tx.events.append({
    pageId: stoppedTimer.pageId,
    namespace: timerNamespace,
    type: "stopped",
    payload: {
      segmentId: stoppedTimer.segmentId,
      stoppedAt: stoppedTimer.stoppedAt,
      elapsedSeconds: elapsedSeconds(stoppedTimer.elapsedMs),
    },
  });

  return stoppedTimer;
}

function finalizeActiveTimer(
  tx: PluginTransaction,
  timer: ActiveTimerState,
): FinalizedTimer {
  const stoppedTimer = appendStoppedEvent(tx, timer);
  const createdSegment = createTimeSegmentDto(stoppedTimer);

  tx.events.append({
    pageId: createdSegment.pageId,
    namespace: timerNamespace,
    type: timeSegmentCreatedType,
    payload: createdSegment,
  });

  return {
    createdSegment,
    stoppedTimer,
  };
}

function createTimeSegmentDto(timer: StoppedTimerState): TimeSegmentDto {
  return {
    durationSeconds: elapsedSeconds(timer.elapsedMs),
    endAt: timer.stoppedAt,
    pageId: timer.pageId,
    segmentId: timer.segmentId,
    source: "timer",
    startAt: timer.startedAt,
  };
}

function createStartedTimer(page: MarkdownPage): ActiveTimerState {
  const startedAtMs = Date.now();

  return {
    elapsedMs: 0,
    lastResumedAtMs: startedAtMs,
    pageId: page.id,
    pageTitle: page.title,
    segmentId: createSegmentId(),
    startedAt: createInstantFromMs(startedAtMs),
    status: "running",
  };
}

function pauseActiveTimer(timer: ActiveTimerState): ActiveTimerState {
  const pausedAtMs = Date.now();

  return {
    ...timer,
    elapsedMs: calculateElapsedMs(timer, pausedAtMs),
    lastResumedAtMs: pausedAtMs,
    status: "paused",
  };
}

function createActiveTimerStore(): ActiveTimerStore {
  let activeTimer: ActiveTimerState | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      return activeTimer;
    },

    setActive(timer) {
      activeTimer = timer;

      for (const listener of listeners) {
        listener();
      }
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createTimerGlobalActiveBar(
  store: ActiveTimerStore,
): ComponentType<TimerGlobalActiveBarProps> {
  function TimerGlobalActiveBar({ commands }: TimerGlobalActiveBarProps) {
    const activeTimer = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
    );
    const visibleElapsed = useVisibleElapsed(activeTimer);

    if (activeTimer === null) {
      return null;
    }

    const controls = createTimerControls(commands);

    return createElement(
      "section",
      {
        "aria-label": "Active timer",
        role: "region",
      },
      createElement("span", null, activeTimer.pageTitle),
      createElement("span", null, formatElapsedSeconds(visibleElapsed.seconds)),
      activeTimer.status === "running"
        ? createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                runControlCommand(controls.pause);
              },
            },
            "Pause",
          )
        : createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                runControlCommand(controls.resume);
              },
            },
            "Resume",
          ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            runControlCommand(controls.stop);
          },
        },
        "Stop",
      ),
      createElement(
        "button",
        {
          type: "button",
          disabled: true,
        },
        "Switch",
      ),
    );
  }

  return TimerGlobalActiveBar;
}

function createTimerPageTimeline(
  ctx: PluginContext,
): ComponentType<TimerPageTimelineProps> {
  function TimerPageTimeline({ page }: TimerPageTimelineProps) {
    const segments = listTimelineSegments(ctx, page.id);

    return createElement(
      "section",
      {
        "aria-label": "Time segments",
        role: "region",
      },
      createElement("h2", null, "Time segments"),
      segments.length === 0
        ? createElement("p", null, "No time segments")
        : createElement(
            "ol",
            null,
            segments.map(({ noteLines, segment }) =>
              createElement(
                "li",
                { key: segment.segmentId },
                createElement("time", { dateTime: segment.startAt }, segment.startAt),
                createElement("span", null, ` ${segment.durationSeconds}s`),
                noteLines.map((line, index) =>
                  createElement(
                    "p",
                    { key: `${segment.segmentId}-note-${index}` },
                    line,
                  ),
                ),
              ),
            ),
          ),
    );
  }

  return TimerPageTimeline;
}

function listTimelineSegments(
  ctx: PluginContext,
  pageId: string,
): Array<{ noteLines: string[]; segment: TimeSegmentDto }> {
  const events = ctx.events.list({ namespace: timerNamespace });
  const notePageIds = collectNotePageIds(events, pageId);

  return events.flatMap((event) => {
    const segment = readTimeSegmentEvent(event);

    if (segment === null || segment.pageId !== pageId || event.pageId !== pageId) {
      return [];
    }

    const notePageId = notePageIds.get(segment.segmentId);
    const noteLines = notePageId === undefined
      ? []
      : readNotePageLines(ctx, notePageId);

    return [
      {
        noteLines,
        segment,
      },
    ];
  });
}

function collectNotePageIds(
  events: readonly AppEvent[],
  pageId: string,
): Map<string, string> {
  const notePageIds = new Map<string, string>();

  for (const event of events) {
    const note = readTimeSegmentNoteEvent(event);

    if (note !== null && event.pageId === pageId) {
      notePageIds.set(note.segmentId, note.notePageId);
    }
  }

  return notePageIds;
}

function readNotePageLines(ctx: PluginContext, notePageId: string): string[] {
  try {
    return exportStructuredDocumentToMarkdown(ctx.pages.get(notePageId).body)
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function useVisibleElapsed(timer: ActiveTimerState | null): {
  seconds: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (timer?.status !== "running") {
      return undefined;
    }

    const intervalId = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [
    timer?.elapsedMs,
    timer?.lastResumedAtMs,
    timer?.segmentId,
    timer?.status,
  ]);

  if (timer === null) {
    return {
      seconds: 0,
    };
  }

  return {
    seconds: elapsedSeconds(calculateElapsedMs(timer, nowMs)),
  };
}

function createTimerControls(commands: TimerGlobalActiveBarProps["commands"]): {
  pause(): Promise<unknown>;
  resume(): Promise<unknown>;
  stop(): Promise<unknown>;
} {
  const execute = commands.execute.bind(commands);

  return {
    pause: () => execute(pauseTimerCommandId, {}),
    resume: () => execute(resumeTimerCommandId, {}),
    stop: () => execute(stopTimerCommandId, {}),
  };
}

function runControlCommand(command: () => Promise<unknown>): void {
  void command()
    .catch(() => {
      ignoreControlFailure();
    });
}

function ignoreControlFailure(): void {
  return undefined;
}

function toTimerDto(
  timer: ActiveTimerState | StoppedTimerState,
  nowMs = Date.now(),
): TimerDto {
  const elapsedMs =
    timer.status === "stopped"
      ? timer.elapsedMs
      : calculateElapsedMs(timer, nowMs);
  const dto: TimerDto = {
    elapsedSeconds: elapsedSeconds(elapsedMs),
    pageId: timer.pageId,
    pageTitle: timer.pageTitle,
    segmentId: timer.segmentId,
    startedAt: timer.startedAt,
    status: timer.status,
  };

  if (timer.status === "stopped") {
    dto.stoppedAt = timer.stoppedAt;
  }

  return dto;
}

function calculateElapsedMs(timer: ActiveTimerState, nowMs: number): number {
  if (timer.status === "paused") {
    return timer.elapsedMs;
  }

  return timer.elapsedMs + Math.max(0, nowMs - timer.lastResumedAtMs);
}

function elapsedSeconds(elapsedMs: number): number {
  return Math.floor(elapsedMs / 1_000);
}

function formatElapsedSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function readPageTimerInput(
  input: unknown,
  commandId: string,
): { pageId: string } {
  const payload = readExactRecord(input, pageTimerInputKeys, `${commandId} input`);
  const pageId = payload.pageId;

  if (typeof pageId !== "string" || pageId.trim().length === 0) {
    throw new Error(`${commandId} requires pageId`);
  }

  return { pageId };
}

function readTimerNoteInput(
  input: unknown,
): { markdown: string; segmentId: string } {
  const payload = readExactRecord(
    input,
    timerNoteInputKeys,
    `${addTimerNoteCommandId} input`,
  );
  const segmentId = payload.segmentId;
  const markdown = payload.markdown;

  if (typeof segmentId !== "string" || segmentId.trim().length === 0) {
    throw new Error(`${addTimerNoteCommandId} requires segmentId`);
  }

  if (typeof markdown !== "string") {
    throw new Error(`${addTimerNoteCommandId} requires markdown`);
  }

  return { markdown, segmentId };
}

function readEmptyTimerInput(input: unknown, commandId: string): void {
  if (input === undefined) {
    return;
  }

  const payload = readExactRecord(input, new Set(), `${commandId} input`);

  if (Object.keys(payload).length !== 0) {
    throw new Error(`${commandId} input must be empty`);
  }
}

function readExactRecord(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${label} must be an object`);
  }

  const prototype = Object.getPrototypeOf(input);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }

  const ownKeys = Reflect.ownKeys(input);

  if (prototype === null && ownKeys.length > 0) {
    throw new Error(`${label} contains untrusted fields`);
  }

  if (ownKeys.length !== allowedKeys.size) {
    throw new Error(`${label} contains untrusted fields`);
  }

  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new Error(`${label} contains untrusted fields`);
    }

    if (unsafePayloadKeys.has(key) || !allowedKeys.has(key)) {
      throw new Error(`${label} contains untrusted fields`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} contains untrusted fields`);
    }
  }

  for (const key of allowedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  if (prototype !== null) {
    for (const key of allowedKeys) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        throw new Error(`${label} is missing ${key}`);
      }
    }
  }

  return input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findTimerSegment(
  events: readonly AppEvent[],
  segmentId: string,
): TimeSegmentDto | undefined {
  for (const event of events) {
    const segment = readTimeSegmentEvent(event);

    if (segment?.segmentId === segmentId) {
      return segment;
    }
  }

  return undefined;
}

function findLatestNotePageId(
  events: readonly AppEvent[],
  segmentId: string,
  pageId: string,
): string | undefined {
  let notePageId: string | undefined;

  for (const event of events) {
    const note = readTimeSegmentNoteEvent(event);

    if (note?.segmentId === segmentId && event.pageId === pageId) {
      notePageId = note.notePageId;
    }
  }

  return notePageId;
}

function readTimeSegmentEvent(event: AppEvent): TimeSegmentDto | null {
  if (
    event.namespace !== timerNamespace ||
    event.type !== timeSegmentCreatedType ||
    event.sourcePluginId !== timerNamespace ||
    event.pageId === undefined
  ) {
    return null;
  }

  const segment = readTimeSegmentPayload(event.payload);

  if (segment === null || segment.pageId !== event.pageId) {
    return null;
  }

  return segment;
}

function readTimeSegmentNoteEvent(
  event: AppEvent,
): { notePageId: string; segmentId: string } | null {
  if (
    event.namespace !== timerNamespace ||
    event.type !== timeSegmentNoteAddedType ||
    event.sourcePluginId !== timerNamespace ||
    event.pageId === undefined ||
    !isRecord(event.payload)
  ) {
    return null;
  }

  const keys = Object.keys(event.payload).sort();

  if (keys.join("\u0000") !== "notePageId\u0000notedAt\u0000segmentId") {
    return null;
  }

  const { notePageId, notedAt, segmentId } = event.payload;

  if (
    typeof notePageId !== "string" ||
    notePageId.trim().length === 0 ||
    typeof notedAt !== "string" ||
    notedAt.trim().length === 0 ||
    typeof segmentId !== "string" ||
    segmentId.trim().length === 0
  ) {
    return null;
  }

  return { notePageId, segmentId };
}

function readTimeSegmentPayload(payload: unknown): TimeSegmentDto | null {
  if (!isRecord(payload)) {
    return null;
  }

  const keys = Object.keys(payload).sort();
  const hasNotePageId = Object.prototype.hasOwnProperty.call(
    payload,
    "notePageId",
  );
  const expectedKeys = [
    "durationSeconds",
    "endAt",
    "pageId",
    "segmentId",
    "source",
    "startAt",
    ...(hasNotePageId ? ["notePageId"] : []),
  ].sort();

  if (keys.join("\u0000") !== expectedKeys.join("\u0000")) {
    return null;
  }

  const {
    durationSeconds,
    endAt,
    notePageId,
    pageId,
    segmentId,
    source,
    startAt,
  } = payload;

  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0 ||
    typeof endAt !== "string" ||
    endAt.trim().length === 0 ||
    typeof pageId !== "string" ||
    pageId.trim().length === 0 ||
    typeof segmentId !== "string" ||
    segmentId.trim().length === 0 ||
    source !== "timer" ||
    typeof startAt !== "string" ||
    startAt.trim().length === 0
  ) {
    return null;
  }

  if (
    hasNotePageId &&
    (typeof notePageId !== "string" || notePageId.trim().length === 0)
  ) {
    return null;
  }

  return {
    durationSeconds,
    endAt,
    pageId,
    segmentId,
    source,
    startAt,
    ...(hasNotePageId ? { notePageId: notePageId as string } : {}),
  };
}

function createCurrentInstant(): string {
  return createInstantFromMs(Date.now());
}

function createInstantFromMs(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function createSegmentId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `timer-segment-${randomUuid}`;
  }

  return `timer-segment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
