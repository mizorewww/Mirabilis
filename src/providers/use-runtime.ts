import { useContext } from "react";

import type { AppRuntime } from "../bootstrap";
import { RuntimeContext } from "./runtime-context";

export function useRuntime<Runtime extends object = AppRuntime>(): Runtime {
  const runtime = useContext(RuntimeContext);

  if (runtime === null) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }

  return runtime as Runtime;
}
