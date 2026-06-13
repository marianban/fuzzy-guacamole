import { createFileRoute } from '@tanstack/react-router';

import styles from './generations.module.css';

export const Route = createFileRoute('/generations')({
  component: GenerationsPage
});

export function GenerationsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas} data-testid="generation-canvas" />
      <aside aria-label="Generation controls" className={styles.sidePanel} />
      <footer aria-label="Generation history" className={styles.footer} />
    </div>
  );
}
