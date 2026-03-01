import useSWR from 'swr';

import { appStatusResponseSchema, type AppStatusResponse } from '../../shared/status';
import styles from './App.module.css';

async function fetchStatus(url: string): Promise<AppStatusResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Status request failed with ${response.status}`);
  }

  return appStatusResponseSchema.parse(await response.json());
}

export function App() {
  const { data, error, isLoading } = useSWR('/api/status', fetchStatus, {
    dedupingInterval: 2_000,
    refreshInterval: 5_000
  });

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Comfy Frontend Orchestrator</h1>
        <p className={styles.description}>
          Milestone 1 scaffold is running. API state is polled from{' '}
          <code>/api/status</code>.
        </p>
        {isLoading && <p>Checking status...</p>}
        {error !== undefined && (
          <p role="alert">Failed to load status: {error.message}</p>
        )}
        {data !== undefined && (
          <dl className={styles.statusGrid}>
            <dt>State</dt>
            <dd>{data.state}</dd>
            <dt>Since</dt>
            <dd>{new Date(data.since).toLocaleString()}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
