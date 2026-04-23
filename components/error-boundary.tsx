"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback node. If omitted, the boundary renders a sensible default. */
  fallback?: ReactNode;
  /** If true, the fallback includes a "Reintentar" button that resets the boundary. */
  resettable?: boolean;
  /** Called with the error so callers can log to external services (Sentry, etc.). */
  onError?: (error: Error, componentStack: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // In development surface the stack; in prod keep it quiet unless a
    // caller-provided onError hook exists. Without an observability service
    // (Sentry/LogRocket) we can't meaningfully ship these anywhere.
    if (process.env.NODE_ENV !== "production") {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
    this.props.onError?.(error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    // Default app-level fallback. Small, readable, and offers a reset path
    // when `resettable` is true so the user isn't trapped on a blank screen.
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-3xl select-none" aria-hidden="true">
          💥
        </div>
        <h2 className="text-base font-bold text-foreground">
          Algo se rompió
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Hubo un error inesperado. Tus datos están a salvo en tu dispositivo.
          Si vuelve a pasar, intenta recargar la app.
        </p>
        {this.props.resettable && (
          <button
            type="button"
            onClick={this.reset}
            className="mt-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
          >
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Recargar la app
        </button>
      </div>
    );
  }
}
