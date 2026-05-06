import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { ModuleErrorBoundary } from './error-boundary.js';

interface LazyModuleProps {
  module: string;
  loader: () => Promise<{ default: ComponentType<unknown> }>;
  fallback?: ReactNode;
}

/**
 * Lazy-load a feature module with its own error boundary and Suspense.
 *
 * If the chunk fails to load (network error, missing deploy), the error
 * boundary shows a fallback. The rest of the app continues running.
 * See ADR-0003.
 */
export function LazyModule({ module, loader, fallback }: LazyModuleProps) {
  const Lazy = lazy(loader);
  return (
    <ModuleErrorBoundary module={module}>
      <Suspense
        fallback={
          fallback ?? (
            <div className="p-6 text-sm text-neutral-500">
              Loading module &quot;{module}&quot;…
            </div>
          )
        }
      >
        <Lazy />
      </Suspense>
    </ModuleErrorBoundary>
  );
}
