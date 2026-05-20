import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import { createNativeBridge } from "./native-bridge";
import type {
  NativeBridge,
  NativeBridgeCommand,
  NativeInvoke,
} from "./native-bridge";

export function createTauriNativeBridge(): NativeBridge {
  const invoke: NativeInvoke = <Response>(
    command: NativeBridgeCommand,
    args: Record<string, unknown>,
  ) => tauriInvoke<Response>(command, args);

  return createNativeBridge({ invoke });
}
