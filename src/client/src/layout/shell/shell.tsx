import { useTranslation } from 'react-i18next';
import { SidePanel } from '../../components/side-panel/side-panel';
import { Header } from '../header/header';
import styles from './shell.module.css';

export const Shell = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.canvas}>{children}</main>
      <div className={styles.sidePanel}>
        <SidePanel
          title={t('ControlPanel.Title', 'Control Panel')}
          content={<div>controls</div>}
          footer={<div>footer</div>}
        />
      </div>
      <footer className={styles.footer}></footer>
    </div>
  );
};
