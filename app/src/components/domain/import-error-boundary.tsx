"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

export class ImportErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void error;
    void info;
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="material-symbols-outlined mb-4 text-5xl text-red-500">
            error
          </span>
          <h2 className="text-title-lg font-bold text-on-surface">
            Something went wrong
          </h2>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            An unexpected error occurred while rendering this section.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
            onClick={this.handleReset}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
