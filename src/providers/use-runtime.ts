import { useContext } from "react";

import { RuntimeContext, type PublicRuntime } from "./runtime-context";

export function useRuntime(): PublicRuntime {
  const runtime = useContext(RuntimeContext);

  if (runtime === null) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }

  return runtime;
}
