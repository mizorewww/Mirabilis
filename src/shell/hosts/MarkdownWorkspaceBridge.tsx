import { type ReactNode } from "react";

import {
  MarkdownWorkspaceBridgeContext,
  type MarkdownWorkspaceBridgeValue,
} from "./MarkdownWorkspaceBridgeContext";

export function MarkdownWorkspaceBridgeProvider({
  bridge,
  children,
}: {
  bridge: MarkdownWorkspaceBridgeValue;
  children: ReactNode;
}) {
  return (
    <MarkdownWorkspaceBridgeContext.Provider value={bridge}>
      {children}
    </MarkdownWorkspaceBridgeContext.Provider>
  );
}
