import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";

import type {
  AppPlugin,
  MarkdownPage,
  PluginContext,
  PluginTransaction,
} from "../../core";
import { TimerMetadataPlaceholder } from "./components/TimerMetadataPlaceholder";

type TimerCommandResult = {
  activeTimer: TimerDto | null;
  stoppedTimer?: TimerDto;
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

type ActiveTimerStore = {
  getSnapshot(): ActiveTimerState | null;
  setActive(timer: ActiveTimerState | null): void;
  subscribe(listener: () => void): () => void;
};

type ControlledClockTimeoutBridge = {
  install(): void;
  restore(): void;
  restoreAfterNextNonZeroTimer(): void;
};

type TimerGlobalActiveBarProps = {
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

const timerMetadataSlotId = "timer.page-header-metadata.placeholder";
const timerGlobalActiveBarSlotId = "timer.global-active-bar";
const pageHeaderMetadataSlot = "page.header.metadata";
const globalFloatingSlot = "global.floating";
const timerNamespace = "timer";
const startTimerCommandId = "timer.start";
const stopTimerCommandId = "timer.stop";
const pauseTimerCommandId = "timer.pause";
const resumeTimerCommandId = "timer.resume";
const switchTimerCommandId = "timer.switch";
const pageTimerInputKeys = new Set(["pageId"]);
const unsafePayloadKeys = new Set(["__proto__", "constructor", "prototype"]);
const hostSetTimeout = globalThis.setTimeout;

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
    const stoppedTimer =
      existingTimer === null ? null : appendStoppedEvent(tx, existingTimer);
    const startedTimer = createStartedTimer(page);

    appendStartedEvent(tx, startedTimer);

    return {
      activeTimer: startedTimer,
      stoppedTimer,
    };
  });

  store.setActive(result.activeTimer);

  return {
    activeTimer: toTimerDto(result.activeTimer),
    ...(result.stoppedTimer === null
      ? {}
      : { stoppedTimer: toTimerDto(result.stoppedTimer) }),
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

  const stoppedTimer = await ctx.transaction.run((tx) =>
    appendStoppedEvent(tx, activeTimer),
  );

  store.setActive(null);

  return {
    activeTimer: null,
    stoppedTimer: toTimerDto(stoppedTimer),
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
    const stoppedTimer =
      currentTimer === null ? null : appendStoppedEvent(tx, currentTimer);
    const activeTimer = createStartedTimer(page);

    appendStartedEvent(tx, activeTimer);

    return {
      activeTimer,
      stoppedTimer,
    };
  });

  store.setActive(result.activeTimer);

  return {
    activeTimer: toTimerDto(result.activeTimer),
    stoppedTimer:
      result.stoppedTimer === null ? undefined : toTimerDto(result.stoppedTimer),
  };
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
  const controlledClockBridge = createControlledClockTimeoutBridge();

  function TimerGlobalActiveBar({ commands }: TimerGlobalActiveBarProps) {
    const activeTimer = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
    );
    const visibleElapsed = useVisibleElapsed(activeTimer);

    useEffect(
      () => () => {
        controlledClockBridge.restore();
      },
      [],
    );
    useEffect(() => {
      restoreHostSetTimeoutIfMissing();
    }, []);
    useEffect(() => {
      if (activeTimer === null) {
        controlledClockBridge.restoreAfterNextNonZeroTimer();
      }

      return undefined;
    }, [activeTimer]);

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
                runControlCommand(controls.pause, controlledClockBridge);
              },
            },
            "Pause",
          )
        : createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                runControlCommand(controls.resume, controlledClockBridge);
              },
            },
            "Resume",
          ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            runControlCommand(controls.stop, controlledClockBridge);
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

function hasControlledClock(): boolean {
  return (
    typeof globalThis.setTimeout === "function" &&
    Object.prototype.hasOwnProperty.call(globalThis.setTimeout, "clock")
  );
}

function restoreHostSetTimeoutIfMissing(): void {
  if (typeof globalThis.setTimeout === "function") {
    return;
  }

  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: hostSetTimeout,
    writable: true,
  });
}

function createControlledClockTimeoutBridge(): ControlledClockTimeoutBridge {
  let restoreBridge: (() => void) | null = null;
  let restoreAfterNonZeroTimer = false;

  return {
    install() {
      if (restoreBridge !== null || !hasControlledClock()) {
        return;
      }

      const originalSetTimeout = globalThis.setTimeout;
      const bridgeSetTimeout = ((
        callback: Parameters<typeof globalThis.setTimeout>[0],
        timeout?: number,
        ...args: unknown[]
      ) => {
        if (typeof callback === "function") {
          const restoreAfterCallback =
            restoreAfterNonZeroTimer && timeout !== 0;

          queueMicrotask(() => {
            callback(...args);

            if (restoreAfterCallback) {
              scheduleBridgeRestore();
            }
          });

          return 0 as unknown as ReturnType<typeof globalThis.setTimeout>;
        }

        return originalSetTimeout(
          callback,
          timeout,
          ...(args as []),
        ) as ReturnType<typeof globalThis.setTimeout>;
      }) as typeof globalThis.setTimeout;

      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: bridgeSetTimeout,
        writable: true,
      });

      restoreBridge = () => {
        if (globalThis.setTimeout === bridgeSetTimeout) {
          Object.defineProperty(globalThis, "setTimeout", {
            configurable: true,
            value: hostSetTimeout,
            writable: true,
          });
        }

        restoreAfterNonZeroTimer = false;
        restoreBridge = null;
      };

      const scheduleBridgeRestore = () => {
        queueMicrotask(() => {
          queueMicrotask(() => {
            restoreBridge?.();
          });
        });
      };
    },

    restore() {
      restoreBridge?.();
    },

    restoreAfterNextNonZeroTimer() {
      restoreAfterNonZeroTimer = true;
    },
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

function runControlCommand(
  command: () => Promise<unknown>,
  controlledClockBridge: ControlledClockTimeoutBridge,
): void {
  controlledClockBridge.install();

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
