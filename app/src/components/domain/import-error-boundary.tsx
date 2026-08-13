"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { useI18n } from "@/providers/i18n-provider";

/**
 * Fallback UI for {@link ImportErrorBoundary}.
 *
 * A class component cannot call `useI18n()`, so the translated markup lives
 * in this function component and the boundary renders it.
 */
function ImportErrorFallback({ onReset }: { onReset: () => void }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="material-symbols-outlined mb-4 text-5xl text-red-500">
        error
      </span>
      <h2 className="text-title-lg font-bold text-on-surface">
        {t("common.error")}
      </h2>
      <p className="mt-2 text-body-sm text-on-surface-variant">
        {t("common.unexpectedRenderError")}
      </p>
      <button
        type="button"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
        onClick={onReset}
      >
        {t("common.tryAgain")}
      </button>
    </div>
  );
}

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
      return <ImportErrorFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}
