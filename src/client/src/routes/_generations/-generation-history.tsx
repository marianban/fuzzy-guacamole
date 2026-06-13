import { ChevronDown, Images, ListFilter } from 'lucide-react';

import styles from './generation-history.module.css';

/** Empty-state generation history dock. */
export function GenerationHistory() {
  return (
    <footer
      aria-label="Generation history"
      className={styles.history}
      data-node-id="1:872"
    >
      <header className={styles.header}>
        <div className={styles.summary}>
          <h2 className={styles.title}>Recent history</h2>
          <span aria-hidden="true" className={styles.divider} />
          <span className={styles.count}>0 Total Generations</span>
        </div>

        <div aria-hidden="true" className={styles.headerTools}>
          <ListFilter size={12} strokeWidth={1.5} />
          <span className={styles.collapseIcon}>
            <ChevronDown size={16} strokeWidth={1.5} />
          </span>
        </div>
      </header>

      <div className={styles.emptyState}>
        <Images
          aria-hidden="true"
          className={styles.emptyIcon}
          size={48}
          strokeWidth={1}
        />
        <p className={styles.emptyTitle}>Gallery is currently empty</p>
        <p className={styles.emptyDescription}>
          Start a new generation to build your project library
        </p>
      </div>
    </footer>
  );
}
