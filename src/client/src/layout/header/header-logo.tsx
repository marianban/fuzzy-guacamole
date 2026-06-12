import { Trans } from 'react-i18next';
import styles from './header-logo.module.css';
import { Link } from '@tanstack/react-router';

export const HeaderLogo = () => {
  return (
    <h1 className={styles.logo}>
      <span>
        <Link to="/">
          <Trans i18nKey="Header.Logo">
            Comfy<span className={styles.logoAccent}>Star</span>
          </Trans>
        </Link>
      </span>
    </h1>
  );
};
