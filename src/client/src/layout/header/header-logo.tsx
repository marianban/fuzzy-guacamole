import styles from './header-logo.module.css';

export const HeaderLogo = () => {
  return (
    <h1 className={styles.logo}>
      <span>
        Comfy<span className={styles.logoAccent}>Star</span>
      </span>
    </h1>
  );
};
