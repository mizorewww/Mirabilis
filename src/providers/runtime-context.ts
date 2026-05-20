import { createContext } from "react";

import type { AppRuntimeInfo } from "../core";

export type PublicRuntime = {
  readonly app: AppRuntimeInfo;
};

export type RuntimeSource = {
  readonly app: AppRuntimeInfo;
};

export const RuntimeContext = createContext<PublicRuntime | null>(null);
