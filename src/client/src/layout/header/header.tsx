import styles from './header.module.css';
import starPng from './star.png';

export const Header = () => {
  return (
    <header className={styles.header}>
      <h1 className={styles.headerTitle}>
        <img src={starPng} alt="Star icon" className={styles.headerIcon} />
        <span>
          Comfy<span className={styles.headerAccent}>Star</span>
        </span>
      </h1>
    </header>
  );
};
