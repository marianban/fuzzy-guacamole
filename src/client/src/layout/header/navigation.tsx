import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from './navigation.module.css';

export const Navigation = () => {
  const { t } = useTranslation();
  return (
    <nav aria-label="Primary" className={styles.navigation}>
      <a className={styles.menuLink} href="/">
        <Sparkles aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>{t('Navigation.Generations', 'Generations')}</span>
      </a>
    </nav>
  );
};
