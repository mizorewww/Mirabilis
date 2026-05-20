import { useEffect, useState, type ReactNode } from "react";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import { RuntimeContext } from "./runtime-context";

export type RuntimeInitializer<Runtime extends object = AppRuntime> =
  () => Promise<Runtime>;

export type RuntimeProviderProps<Runtime extends object = AppRuntime> = {
  runtime?: Runtime;
  initializeRuntime?: RuntimeInitializer<Runtime>;
  children: ReactNode;
  loadingFallback?: ReactNode;
  failureFallback?: ReactNode;
};

type RuntimeState<Runtime extends object> =
  | { status: "loading" }
  | { status: "ready"; runtime: Runtime }
  | { status: "failed" };

const initializationPromises = new WeakMap<
  RuntimeInitializer<object>,
  Promise<object>
>();

export function RuntimeProvider<Runtime extends object = AppRuntime>({
  runtime,
  initializeRuntime,
  children,
  loadingFallback,
  failureFallback,
}: RuntimeProviderProps<Runtime>) {
  if (runtime !== undefined) {
    return (
      <RuntimeContext.Provider value={runtime}>
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

function RuntimeInitializationBoundary<Runtime extends object = AppRuntime>({
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
  const [state, setState] = useState<RuntimeState<Runtime>>(() =>
    ({ status: "loading" }),
  );

  useEffect(() => {
    let active = true;

    getInitializationPromise(initializeRuntime)
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
  }, [initializeRuntime]);

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
    <RuntimeContext.Provider value={state.runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}

function getInitializationPromise<Runtime extends object>(
  initializeRuntime: RuntimeInitializer<Runtime>,
): Promise<Runtime> {
  const initializer = initializeRuntime as RuntimeInitializer<object>;
  const existingPromise = initializationPromises.get(initializer);

  if (existingPromise !== undefined) {
    return existingPromise as Promise<Runtime>;
  }

  const promise = Promise.resolve().then(initializeRuntime);

  initializationPromises.set(initializer, promise as Promise<object>);

  return promise;
}
