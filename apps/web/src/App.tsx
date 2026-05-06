import { LazyModule } from './lib/lazy-module.js';

export function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-900 px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight">Streetlifting App</h1>
      </header>
      <main>
        <LazyModule
          module="_health"
          loader={() => import('./features/_health/index.js')}
        />
      </main>
    </div>
  );
}
