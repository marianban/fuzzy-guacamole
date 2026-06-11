import clsx from 'clsx';
import { type ReactNode, useId } from 'react';

import styles from './side-panel.module.css';

export interface SidePanelProps {
  title: ReactNode;
  content: ReactNode;
  footer: ReactNode;
  className?: string;
}

/**
 * A reusable right-rail panel with a fixed title area, scrollable body, and clipped footer.
 */
export function SidePanel({ title, content, footer, className }: SidePanelProps) {
  const titleId = useId();

  return (
    <aside aria-labelledby={titleId} className={clsx(styles.root, className)}>
      <header className={styles.header}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
      </header>
      <main className={styles.content} data-testid="side-panel-content">
        {content}
      </main>
      <footer className={styles.footer} data-testid="side-panel-footer">
        {footer}
      </footer>
    </aside>
  );
}
