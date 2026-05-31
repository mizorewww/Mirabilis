import { Component, type ReactNode } from "react";
import Alert from "@mui/material/Alert";

type PluginRenderBoundaryProps = {
  children: ReactNode;
  fallbackLabel?: string;
  fallbackText?: string;
  resetKey?: string;
};

type PluginRenderBoundaryState = {
  hasFailure: boolean;
};

export class PluginRenderBoundary extends Component<
  PluginRenderBoundaryProps,
  PluginRenderBoundaryState
> {
  override state: PluginRenderBoundaryState = {
    hasFailure: false,
  };

  static getDerivedStateFromError(failure: unknown): PluginRenderBoundaryState {
    void failure;

    return {
      hasFailure: true,
    };
  }

  override componentDidCatch(): void {
    return undefined;
  }

  override componentDidUpdate(previousProps: PluginRenderBoundaryProps): void {
    if (
      this.state.hasFailure &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({
        hasFailure: false,
      });
    }
  }

  override render(): ReactNode {
    if (!this.state.hasFailure) {
      return this.props.children;
    }

    const label = this.props.fallbackLabel ?? "Plugin view unavailable";

    return (
      <Alert aria-label={label} severity="error">
        {this.props.fallbackText ?? label}
      </Alert>
    );
  }
}
