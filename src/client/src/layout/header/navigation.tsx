import { Sparkles } from 'lucide-react';

import styles from './navigation.module.css';

export const Navigation = () => {
  return (
    <nav aria-label="Primary" className={styles.navigation}>
      <a className={styles.menuLink} href="/">
        <Sparkles aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>Generations</span>
      </a>
    </nav>
  );
};
