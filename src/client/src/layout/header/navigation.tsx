import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './navigation.module.css';
import { Link } from '@tanstack/react-router';

export const Navigation = () => {
  const { t } = useTranslation();
  return (
    <nav aria-label="Primary" className={styles.navigation}>
      <Link className={styles.menuLink} to="/generations">
        <Sparkles aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>{t('Navigation.Generations', 'Generations')}</span>
      </Link>
    </nav>
  );
};
