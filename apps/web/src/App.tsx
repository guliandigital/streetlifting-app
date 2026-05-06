import { LazyModule } from './lib/lazy-module.js';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-900 px-6 py-3 flex items-center gap-3">
        <img src="/brand/symbol-inverse.png" alt="" className="h-8 w-8" />
        <h1 className="text-base font-semibold tracking-tight">Streetlifting App</h1>
      </header>
      <main className="flex-1">
        <LazyModule
          module="_health"
          loader={() => import('./features/_health/index.js')}
        />
      </main>
    </div>
  );
}
