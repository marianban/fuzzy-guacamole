import { Header } from '../header/header';
import styles from './shell.module.css';

export const Shell = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>{children}</main>
    </div>
  );
};
