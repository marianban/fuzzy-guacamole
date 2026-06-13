import { createFileRoute } from '@tanstack/react-router';

import { GenerationHistory } from './-generation-history';
import styles from './generations.module.css';

export const Route = createFileRoute('/_generations/generations')({
  component: GenerationsPage
});

export function GenerationsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.canvas} data-testid="generation-canvas" />
      <aside aria-label="Generation controls" className={styles.sidePanel} />
      <GenerationHistory />
    </div>
  );
}
