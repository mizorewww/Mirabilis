import { useEffect, useRef, useState, type ReactNode } from "react";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  RuntimeContext,
  type PublicRuntime,
  type RuntimeSource,
} from "./runtime-context";

export type RuntimeInitializer<Runtime extends RuntimeSource = AppRuntime> =
  () => Promise<Runtime>;

export type RuntimeProviderProps<Runtime extends RuntimeSource = AppRuntime> = {
  runtime?: Runtime;
  initializeRuntime?: RuntimeInitializer<Runtime>;
  children: ReactNode;
  loadingFallback?: ReactNode;
  failureFallback?: ReactNode;
};

type RuntimeState<Runtime extends RuntimeSource> =
  | { status: "loading" }
  | { status: "ready"; runtime: Runtime }
  | { status: "failed" };

const initializationPromises = new WeakMap<
  RuntimeInitializer<RuntimeSource>,
  Promise<RuntimeSource>
>();

export function RuntimeProvider<Runtime extends RuntimeSource = AppRuntime>({
  runtime,
  initializeRuntime,
  children,
  loadingFallback,
  failureFallback,
}: RuntimeProviderProps<Runtime>) {
  if (runtime !== undefined) {
    return (
      <RuntimeContext.Provider value={createPublicRuntime(runtime)}>
        {children}
      </RuntimeContext.Provider>
    );
  }

  return (
    <RuntimeInitializationBoundary
      initializeRuntime={
        initializeRuntime ?? (createAppRuntime as RuntimeInitializer<Runtime>)
      }
      loadingFallback={loadingFallback}
      failureFallback={failureFallback}
    >
      {children}
    </RuntimeInitializationBoundary>
  );
}

function RuntimeInitializationBoundary<Runtime extends RuntimeSource = AppRuntime>({
  initializeRuntime,
  children,
  loadingFallback,
  failureFallback,
}: {
  initializeRuntime: RuntimeInitializer<Runtime>;
  children: ReactNode;
  loadingFallback?: ReactNode;
  failureFallback?: ReactNode;
}) {
  const initializeRuntimeRef = useRef(initializeRuntime);
  const [state, setState] = useState<RuntimeState<Runtime>>(() =>
    ({ status: "loading" }),
  );

  useEffect(() => {
    let active = true;

    getInitializationPromise(initializeRuntimeRef.current)
      .then((initializedRuntime) => {
        if (active) {
          setState({ status: "ready", runtime: initializedRuntime });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "failed" });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "failed") {
    return (
      <>
        {failureFallback ?? (
          <main className="app-startup app-startup--failed">
            <div className="app-startup__message" role="alert">
              Mirabilis could not start. Close and reopen the app.
            </div>
          </main>
        )}
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <>
        {loadingFallback ?? (
          <main className="app-startup" aria-busy="true">
            <p className="app-startup__message">Starting Mirabilis</p>
          </main>
        )}
      </>
    );
  }

  return (
    <RuntimeContext.Provider value={createPublicRuntime(state.runtime)}>
      {children}
    </RuntimeContext.Provider>
  );
}

function getInitializationPromise<Runtime extends RuntimeSource>(
  initializeRuntime: RuntimeInitializer<Runtime>,
): Promise<Runtime> {
  const initializer = initializeRuntime as RuntimeInitializer<RuntimeSource>;
  const existingPromise = initializationPromises.get(initializer);

  if (existingPromise !== undefined) {
    return existingPromise as Promise<Runtime>;
  }

  const promise = Promise.resolve()
    .then(initializeRuntime)
    .catch((error: unknown) => {
      if (initializationPromises.get(initializer) === promise) {
        initializationPromises.delete(initializer);
      }

      throw error;
    });

  initializationPromises.set(initializer, promise as Promise<RuntimeSource>);

  return promise;
}

function createPublicRuntime(runtime: RuntimeSource): PublicRuntime {
  const app =
    runtime.app.pluginApiVersion === undefined
      ? { version: runtime.app.version }
      : {
          version: runtime.app.version,
          pluginApiVersion: runtime.app.pluginApiVersion,
        };

  return Object.freeze({
    app: Object.freeze(app),
  });
}
