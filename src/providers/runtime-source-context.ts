import { createContext, useContext } from "react";

import type { RuntimeSource } from "./runtime-context";

export const RuntimeSourceContext = createContext<RuntimeSource | null>(null);

export function useRuntimeSource<Runtime extends RuntimeSource>(): Runtime {
  const runtime = useContext(RuntimeSourceContext);

  if (runtime === null) {
    throw new Error("useRuntimeSource must be used within RuntimeProvider");
  }

  return runtime as Runtime;
}
