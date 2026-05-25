import { createContext, createElement, useContext, type ReactNode } from "react";

export type MarkdownWorkspaceDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: unknown;
};

export type MarkdownWorkspacePageFacade = {
  load(pageId: string): Promise<MarkdownWorkspaceDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownWorkspaceDocument>;
};

export type MarkdownWorkspaceCommandFacade = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

export type MarkdownWorkspaceExtensionSource = {
  collectEditorExtensions(): readonly unknown[];
};

export type MarkdownWorkspaceBridgeValue = {
  pages: MarkdownWorkspacePageFacade;
  commandBus: MarkdownWorkspaceCommandFacade;
  markdownRuntime: MarkdownWorkspaceExtensionSource;
  openPage(pageId: string): void;
};

const MarkdownWorkspaceBridgeContext =
  createContext<MarkdownWorkspaceBridgeValue | null>(null);

export function MarkdownWorkspaceBridgeProvider({
  bridge,
  children,
}: {
  bridge: MarkdownWorkspaceBridgeValue;
  children: ReactNode;
}) {
  return createElement(
    MarkdownWorkspaceBridgeContext.Provider,
    { value: bridge },
    children,
  );
}

export function useMarkdownWorkspaceBridge():
  | MarkdownWorkspaceBridgeValue
  | undefined {
  return useContext(MarkdownWorkspaceBridgeContext) ?? undefined;
}
