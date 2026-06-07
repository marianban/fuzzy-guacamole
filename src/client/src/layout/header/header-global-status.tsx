import styles from './header-global-status.module.css';

export interface HeaderGlobalStatusProps {
  label: string;
  tone: 'online' | 'warning' | 'offline';
}

export const HeaderGlobalStatus = ({ label, tone }: HeaderGlobalStatusProps) => {
  return (
    <div className={styles.globalStatus} data-tone={tone}>
      <span aria-hidden="true" className={styles.globalStatusDot} />
      <span className={styles.globalStatusLabel}>{label}</span>
    </div>
  );
};
