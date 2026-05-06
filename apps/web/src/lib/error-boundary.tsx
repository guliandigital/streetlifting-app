import { Component, type ErrorInfo, type ReactNode } from 'react';
import { moduleLogger } from './logger.js';

interface ModuleErrorBoundaryProps {
  module: string;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  children: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
}

/**
 * Per-module error boundary. Wrap every feature route with one.
 *
 * A render error inside this module is caught here and shown via `fallback`
 * (or a default banner). The rest of the app shell, navigation, and other
 * feature routes keep working. See ADR-0003.
 *
 * Errors are reported via the module logger (which forwards to Sentry in
 * production with PII scrubbed). See ADR-0005.
 */
export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    moduleLogger(this.props.module).error('module crashed', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? null,
    });
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry);
      }
      return (
        <div className="p-6 m-4 rounded-lg border border-red-900/50 bg-red-950/30 text-red-100">
          <h2 className="font-semibold mb-1">
            Module &quot;{this.props.module}&quot; crashed
          </h2>
          <p className="text-sm text-red-300/80 mb-3">
            The rest of the app is still working. You can retry this module or navigate elsewhere.
          </p>
          <pre className="text-xs bg-black/40 p-2 rounded overflow-auto max-h-48 mb-3">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.retry}
            className="px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-900/80 text-sm"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
