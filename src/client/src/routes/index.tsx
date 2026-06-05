import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: HomePage });

export function HomePage() {
  return (
    <main className="home-page">
      <div className="home-panel">
        <p className="home-eyebrow">Comfy Frontend Orchestrator</p>
        <h1 className="home-title">Welcome to TanStack Start</h1>
        <p className="home-copy">
          Edit <code>src/routes/index.tsx</code> to get started.
        </p>
      </div>
    </main>
  );
}
