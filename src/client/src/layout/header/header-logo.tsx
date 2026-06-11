import { Trans } from 'react-i18next';
import styles from './header-logo.module.css';

export const HeaderLogo = () => {
  return (
    <h1 className={styles.logo}>
      <span>
        <Trans ns="header" i18nKey="Header.Logo">
          Comfy<span className={styles.logoAccent}>Star</span>
        </Trans>
      </span>
    </h1>
  );
};
